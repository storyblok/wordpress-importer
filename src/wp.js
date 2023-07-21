import { getDescendantProp } from './utils.js'
import axios from 'axios'
import {convert} from "html-to-text";

export default class Wp {
  constructor(settings) {
    this.endpoint = settings.endpoint
    this.postSlugs = settings.postSlugs
    this.import_assets = settings.import_assets
    this.content_types = {}
  }

  /**
   * Import taxonomies
   */
  async importTaxonomies(taxonomies) {
    if(!taxonomies) return
    for (let i = 0; i < taxonomies.length; i++) {
      const taxonomy = taxonomies[i]
      if(!this.content_types[taxonomy.name]) {
        await this.getPosts(taxonomy.name)
      }
    }
  }

  removeSizeInfoFromAssetUrlsInPosts(content_name) {
    const assets_regex = new RegExp(`(\\"((http)?s?:?(\\/?\\/[^"]*.(${this.import_assets.types.join('|')})))(\\\\)?")`, "g")
    let regex_results = []
    while ((regex_results = assets_regex.exec(JSON.stringify(this.content_types[content_name])))) {
      const original_url = regex_results[2]
      // The purpose of these incantations is to replace size-specified references in WP posts to ones that do not
      // specify size. Otherwise, the assets won't be recognized later on, and they will appear in a smaller size
      // that is inappropriate for being migrated to a full-width ArticleImage.
      const new_url = original_url.replace(/(-\d+x\d+)(\.[a-zA-Z]+)/g, '$2')
      this.content_types[content_name] = JSON.parse(JSON.stringify(this.content_types[content_name]).replaceAll(original_url, new_url))
    }
  }

  /**
   * Get all posts associated with a content type and 
   * stores them in an array in the class object
   * @param {String} content_name 
   */
  async getPosts(content_name) {
    this.content_types[content_name] = []

    if (content_name === 'posts') {
      for (const slug of this.postSlugs) {
        try {
          let query_endpoint = this.endpoint
          query_endpoint += '/wp/v2/'
          query_endpoint += content_name
          query_endpoint +=  this.endpoint.includes('?') ? '&' : '?'
          query_endpoint += `slug=${slug}`

          const req = await axios.get(query_endpoint)
          this.content_types[content_name] = this.content_types[content_name].concat(req.data)
        } catch (err) {
          console.log(`Error while fetching entries from WordPress: ${err.message}`)
        }
      }
    } else {
      let page_max_i = 1
      for (let page_i = 1; page_i <= page_max_i; page_i++) {
        try {
          let query_endpoint = this.endpoint
          query_endpoint += '/wp/v2/'
          query_endpoint += content_name
          query_endpoint +=  this.endpoint.includes('?') ? '&' : '?'
          query_endpoint += `per_page=25&page=${page_i}`

          const req = await axios.get(query_endpoint)
          this.content_types[content_name] = this.content_types[content_name].concat(req.data)
          if (page_i === 1) {
            page_max_i = req.headers['X-WP-TotalPages'] || req.headers['x-wp-totalpages']
          }
        } catch (err) {
          console.log(`Error while fetching entries from WordPress: ${err.message}`)
        }
      }
    }

    console.log(`Fetched all the entries of ${content_name} type`)
  }

  /**
   * Get the value of a WordPress field
   * @param {Object} entry The object of data
   * @param {String} field The name of the field
   * @returns {Object|String|Array|Number} The value of the field
   */
  async getFieldValue(entry, field) {
    const field_value = getDescendantProp(entry, field)
    if (typeof field_value === 'string') {
      return field_value
    } else if (typeof field_value === 'object' && field_value.rendered) {
      return convert(field_value.rendered)
    } else if (typeof field_value === 'object' && field_value.href) {
      const link = await axios.get(field_value.href)
      return link.data?.source_url
    } else if(field === 'blocks') {
      return field_value
    }
    return field_value
  }

  /**
   * Replace value of a field with the taxonomy
   * @param {Array} taxonomies The taxonomies of the content type
   * @param {Object|String|Array|Number} field_value The value of the field
   * @param {String} source The name of the source field
   * @returns {Object|String|Array|Number} The filtered value
   */
  filterTaxonomyValue(taxonomies, field_value, source) {
    if(taxonomies) {
      const field_taxonomy = taxonomies.find(t => t.field === source)
      if(field_taxonomy) {
        if(Array.isArray(field_value)) {
          field_value = field_value.map(val => this.content_types[field_taxonomy.name].find(t => t.id == val)?.slug)
        } else {
          field_value = this.content_types[field_taxonomy.name].find(t => t.id == field_value)?.slug || field_value
        }
      }
    }
    return field_value
  }
}
