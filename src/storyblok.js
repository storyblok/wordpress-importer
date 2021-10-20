import StoryblokClient from 'storyblok-js-client'
import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import { compareSlugs, getAssetData } from './utils.js'
import async from 'async'
import https from 'https'
import http from 'http'

export default class Storyblok {
  constructor(settings) {
    this.space_id = settings.space_id
    this.simultaneous_uploads = 5
    this.assets_retries = {}
    this.retries_limit = 4
    this.client = new StoryblokClient({
      oauthToken: settings.token
    })
  }

  /**
   * Fetch the components from the space
   */
  async fetchComponents() {
    const res = await this.client.get(`spaces/${this.space_id}/components/`)
    this.components = res.data.components
  }

  /**
   * Get the type of a field in a component
   * @param {String} component_name 
   * @param {String} field_name 
   * @returns {String}
   */
  getFieldType(component_name, field_name) {
    const component = this.components.find(c => c.name === component_name)
    if (!component) {
      console.error(`The component ${component_name} doesn't exist in your Storyblok Space. The field will be imported as plain text`)
      return 'text'
    }

    try {
      if (field_name.indexOf('content.') === 0) {
        return component.schema[field_name.substring(8)].type
      } else if (component.schema[field_name]) {
        return component.schema[field_name].type
      } else {
        return 'text'
      }
    } catch (err) {
      console.error(`The field ${field_name} doesn't exist in the schema of ${component_name}. It will be imported as plain text`)
      return 'text'
    }
  }

  /**
   * Download an asset by URL
   * @param {String} url 
   * @returns {Promise}
   */
  async downloadAsset(url) {
    const asset_data = getAssetData(url)
    if (!fs.existsSync(asset_data.folder)) {
      fs.mkdirSync(asset_data.folder)
    }
    const file = fs.createWriteStream(asset_data.filepath)
    const asset_req = await axios.head(url)
    const file_url = asset_req.request.res.responseUrl
    return new Promise((resolve) => {
      if (file_url.includes('https:')) {
        https.get(file_url, (res) => {
          res.pipe(file)
          file.on('finish', () => {
            file.close(() => resolve(true))
          })
        }).on('error', () => {
          resolve(false)
        })
      } else {
        http.get(file_url, (res) => {
          res.pipe(file)
          file.on('finish', () => {
            file.close(() => resolve(true))
          })
        }).on('error', () => {
          resolve(false)
        })
      }
    })
  }

  /**
   * Upload an asset to Storyblok
   * @param {String} asset 
   * @returns {Promise}
   */
  async uploadAsset(asset) {
    const asset_data = getAssetData(asset)
    try {
      const downloaded = await this.downloadAsset(asset)
      if (!downloaded || !fs.existsSync(asset_data.filepath)) {
        console.log(`Could not upload ASSET ${asset}`)
        return Promise.resolve({ success: false })
      }
      let new_asset_payload = { filename: asset_data.filename }
      const new_asset_request = await this.client.post(`spaces/${this.space_id}/assets`, new_asset_payload)
      if (new_asset_request.status != 200) {
        return Promise.resolve({ success: false })
      }

      const signed_request = new_asset_request.data
      try {
        let form = new FormData()
        for (let key in signed_request.fields) {
          form.append(key, signed_request.fields[key])
        }
        form.append('file', fs.createReadStream(asset_data.filepath))
        return new Promise((resolve) => {
          form.submit(signed_request.post_url, (err) => {
            if (err) {
              return resolve()
            } else {
              this.assets.push({ original_url: asset, new_url: signed_request.pretty_url, id: signed_request.id })
              return resolve()
            }
          })
        })
      } catch (err) {
        return Promise.resolve()
      }
    } catch (err) {
      if (err.config?.url === `/spaces/${this.space_id}/assets` &&
        (err.code === 'ECONNABORTED' || err.message.includes('429'))) {
        if (this.assets_retries[asset] > this.retries_limit) {
          return Promise.resolve()
        } else {
          if (!this.assets_retries[asset]) {
            this.assets_retries[asset] = 1
          } else {
            ++this.assets_retries[asset]
          }
          return this.uploadAsset(asset)
        }
      } else {
        return Promise.resolve()
      }
    }
  }

  /**
   * Upload Assets to the target space
   */
  async uploadAssets(assets) {
    if(!assets.length) return []
    console.log(`Uploading ${assets.length} assets`)
    if (!fs.existsSync('./temp')) {
      fs.mkdirSync('./temp')
    }
    this.assets = []

    return new Promise((resolve) => {
      async.eachLimit(assets, this.simultaneous_uploads, async (asset) => {
        await this.uploadAsset(asset)
      }, () => {
        if (fs.existsSync('./temp')) {
          fs.rmdirSync('./temp', { recursive: true })
        }
        if(this.assets?.length > 0) {
          console.log(`Uploaded ${this.assets.length} assets`)
        }
        resolve(this.assets)
      })
    })
  }

  /**
   * Create folders in the target space
   * @param {Array} folders 
   * @returns {Array} list of created folders
   */
  async createFolders(folders) {
    let created_folders = []
    const links = await this.getLinks()
    for (let i = 0; i < folders.length; i++) {
      let payload = {
        story: {
          name: folders[i].name,
          slug: folders[i].slug,
          is_folder: true
        }
      }

      if (folders[i].parent) {
        const parent = folders.find(f => f.path === folders[i].parent) || links.folders.find(f => compareSlugs(f.slug, folders[i].parent))
        payload.story.parent_id = parent?.id
      }
      try {
        const req = await this.client.post(`spaces/${this.space_id}/stories`, payload)
        folders[i].id = req.data.story.id
        created_folders.push(folders[i])
      } catch (err) {
        console.log(`Could not create folder ${folders[i].path}`)
      }
    }

    return created_folders
  }

  /**
   * Get the uuid of a taxonomy entry
   * @param {Array|String} value 
   * @param {String} taxonomy 
   * @param {Array} created_stories 
   * @returns {Array|String}
   */
  async getUuidForTaxonomy(value, taxonomy, created_stories) {
    const created_story = created_stories.find(s => s.slug === value && s.content.component === taxonomy.taxonomy)
    if(created_story) {
      // If the story has been created in the same session
      // we save an API Request
      value = created_story.uuid
    } else {
      try {
        const res = await this.client.get(`spaces/${this.space_id}/stories`, {
          by_slugs: `*/${value}`,
          content_type: taxonomy.content_type
        })
        if(res.data.stories?.length) {
          value = res.data.stories[0].uuid
        }
      } catch(err) {
        console.log(`Taxonomy ${value} not found`)
      }
    }
    return value
  }

  /**
   * Create stories in a space
   * @param {Array} stories 
   * @param {Array|Null} taxonomies 
   * @returns {Array} The array of created stories
   */
  async createStories(stories, taxonomies) {
    let created_stories = []
    for (let i = 0; i < stories.length; i++) {
      try {
        const content_type_taxonomies = taxonomies?.filter(t => t.content_type === stories[i].content.component && t.type === 'relationship')
        if(content_type_taxonomies.length) {
          for (let t_index = 0; t_index < content_type_taxonomies.length; t_index++) {
            const t = content_type_taxonomies[t_index];
            let story_field_value = stories[i].content[t.field]
            if(Array.isArray(story_field_value)) {
              for (let j = 0; j < story_field_value.length; j++) {
                story_field_value[j] = await this.getUuidForTaxonomy(story_field_value[j], t, created_stories)
              }
            } else {
              stories[i].content[t.field] = await this.getUuidForTaxonomy(stories[i].content[t.field], t, created_stories)
            }
          }
        }
        const req = await this.client.post(`spaces/${this.space_id}/stories`, { story: stories[i] })
        created_stories.push(req.data.story)
      } catch (err) {
        console.log(`Could not create story ${stories[i].name}`)
      }
    }
    return created_stories
  }

  /**
   * Retrieves the links of the current space
   * @returns An object with an array of all the folders called "folders" and 
   *          an array of all the stories called "stories"
   */
  async getLinks() {
    if(!this.cached_links) {
      const res = await this.client.get(`spaces/${this.space_id}`)
      const cdn_token = res.data.space.first_token
      const links_res = await this.client.get('cdn/links/', {
        token: cdn_token,
        version: 'draft'
      })
      this.cached_links = {
        folders: [],
        stories: []
      }
      Object.entries(links_res.data.links).forEach(link => {
        if(link[1].is_folder) {
          this.cached_links.folders.push(link[1])
        } else {
          this.cached_links.stories.push(link[1])
        }
      })
    }
    return this.cached_links
  }
}