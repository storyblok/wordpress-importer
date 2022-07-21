import TurndownService from 'turndown'
import pkg from 'storyblok-markdown-richtext'
import Storyblok from './storyblok.js'
import { compareSlugs } from './utils.js'
import Wp from './wp.js'
const { markdownToRichtext } = pkg

const turndownService = new TurndownService()

const settings_defaults = {
  import_assets: {
    enabled: true,
    types: ['png', 'jpg', 'jpeg', 'gif', 'png', 'svg', 'pdf'],
    restrict_domain: false
  }
}

export default class Wp2Storyblok {
  components = []

  constructor(endpoint, settings = {}) {
    this.endpoint = endpoint
    this.settings = { ...settings_defaults, ...settings }
    // Storyblok and WP Interfaces
    this.wp = new Wp({endpoint: this.endpoint})
    this.storyblok = new Storyblok({ token: settings.token, space_id: settings.space_id })
    // Data to migrate
    this.stories_to_migrate = []
    this.assets_to_migrate = []
    this.folders_to_migrate = []
    this.created_folders = []
    // Sort the categories first so they are imported before everything else
    this.settings.content_types.sort((a, b) => {
      if(this.settings.content_types.find(ct => ct.taxonomies?.find(t => t.name === a.name))) {
        return -1
      }
      if(this.settings.content_types.find(ct => ct.taxonomies?.find(t => t.name === b.name))) {
        return 1
      }
      return 0
    })
  }

  /**
   * Init the migration
   */
  async migrate() {
    // Preparation
    await this.storyblok.fetchComponents()
    await this.prepareStories()
    // Assets import
    if (this.settings.import_assets.enabled) {
      await this.importAssets()
      this.replaceAssetsUrls()
    }
    // Stories and folders import
    await this.importFolders()
    await this.importStories()
  }

  /**
   * Prepare stories for moving them to Storyblok
   */
  async prepareStories() {
    const sb_links = await this.storyblok.getLinks()
    for (let i = 0; i < this.settings.content_types.length; i++) {
      const content_type = this.settings.content_types[i]
      // Import taxonomies for the current content type
      await this.wp.importTaxonomies(content_type.taxonomies)
      // Get all the posts for the content type
      await this.wp.getPosts(content_type.name)
      // Loop through the posts and get the content from WP in the right format
      // for your Storyblok project
      for (let j = 0; j < this.wp.content_types[content_type.name].length; j++) {
        // Get the data from WP
        const wp_entry = this.wp.content_types[content_type.name][j]
        // If a folder is set as destination of the stories, update the link property from WP to have
        // the new folder in it
        if (content_type.folder) {
          const entry_url = new URL(wp_entry.link)
          wp_entry.link = wp_entry.link.replace(entry_url.origin, `${entry_url.origin}/${content_type.folder.replace(/^\//, '').replace(/\/$/, '')}`)
        }
        // Basic data object for Storyblok
        // Temporary properties for managing folders of imported content
        const entry_url = new URL(wp_entry.link)
        const component_name = content_type.new_content_type || content_type.name
        let sb_entry = {
          name: this.wp.getFieldValue(wp_entry, 'title'),
          slug: wp_entry.slug,
          content: {},
          _wp_link: entry_url.pathname,
          _wp_folder: wp_entry.link.includes('?') ? entry_url.pathname : `${entry_url.pathname.split('/').slice(0, -2).join('/')}/`
        }
        if(sb_links.stories.find(l => compareSlugs(l.slug, sb_entry._wp_link))) {
          continue
        }
        // Get the fields from WP in the right format for Storyblok
        const data_from_wp = await this.populateFields(wp_entry, component_name, content_type.schema_mapping, content_type.taxonomies)
        sb_entry = {...sb_entry, ...data_from_wp}
        sb_entry.content.component = component_name
        // Queue the story for migration
        this.stories_to_migrate.push(sb_entry)
        try {
          // If the folder of the current file is not yet in the list of the ones to migrate, it gets added
          if (!this.folders_to_migrate.find(f => f.path === sb_entry['_wp_folder']) && !sb_links.folders.find(f => compareSlugs(f.slug, sb_entry['_wp_folder']))) {
            const folder_slug = sb_entry['_wp_folder'].split('/')[sb_entry['_wp_folder'].split('/').length - 2]
            this.folders_to_migrate.push({ path: sb_entry['_wp_folder'], name: folder_slug.replace(/-_/g, ' '), slug: folder_slug })
          }
        } catch (err) {
          console.log(`Invalid URL for entry ${sb_entry.name}`)
        }
      }
    }
  }

  /**
   * Import all the assets to Storyblok
   */
  async importAssets() {
    const assets_regex = new RegExp(`(\\"((http)?s?:?(\\/?\\/[^"]*.(${this.settings.import_assets.types.join('|')})))(\\\\)?")`, "g")
    let regex_results = []
    while ((regex_results = assets_regex.exec(JSON.stringify(this.stories_to_migrate)))) {
      if (!this.assets_to_migrate.find(asset => asset.original_url == regex_results[2])) {
        const full_url = regex_results[2][0] == '/' ? `${this.settings.domain}${regex_results[2]}` : regex_results[2]
        this.assets_to_migrate.push({ original_url: regex_results[2], full_url })
      }
    }
    this.migrated_assets = await this.storyblok.uploadAssets(this.assets_to_migrate.map(a => a.full_url))
  }

  /**
   * Replace the WordPress URLs of the assets in the entries with the URLs
   * from the Storyblok assets
   */
  replaceAssetsUrls() {
    this.migrated_assets.forEach(asset => {
      try {
        const reg = new RegExp(asset.original_url, 'g')
        this.stories_to_migrate = JSON.parse(JSON.stringify(this.stories_to_migrate).replace(reg, asset.new_url))
      } catch (err) {
        console.log(`Problem replacing URL ${asset.original_url}`)
      }
    })
  }

  /**
   * Import the stories in Storyblok
   */
  async importStories() {
    if(this.stories_to_migrate.length) {
      console.log(`Migrating ${this.stories_to_migrate.length} stories`)
    } else {
      console.log(`No stories to migrate`)
    }
    const stories = await this.storyblok.createStories(this.stories_to_migrate, this.taxonomiesData)
    if(this.stories_to_migrate.length) {
      console.log(`Stories migrated`)
    }
    return stories
  }

  /**
   * Import the folders in Storyblok
   */
  async importFolders() {
    const sb_links = await this.storyblok.getLinks()
    if(this.folders_to_migrate.length) {
      console.log(`Migrating ${this.folders_to_migrate.length} folders`)
    } else {
      console.log(`No folders to migrate`)
    }
    for (let i = 0; i < this.folders_to_migrate.length; i++) {
      const starte_page = this.stories_to_migrate.find(s => s._wp_link === this.folders_to_migrate[i].path)
      if (starte_page) {
        starte_page.is_startpage = true
        starte_page._wp_folder = starte_page._wp_link
      }
    }

    // Create the full list of folders to generate
    for (let j = 0; j < this.folders_to_migrate.length; j++) {
      if (this.folders_to_migrate[j].path.split('/').length > 3) {
        this.folders_to_migrate[j].parent = `${this.folders_to_migrate[j].path.split('/').slice(0, -2).join('/')}/`
        if (!this.folders_to_migrate.find(f => f.path === this.folders_to_migrate[j].parent) && !sb_links.folders.find(f => compareSlugs(f.slug, this.folders_to_migrate[j].parent))) {
          const folder_slug = this.folders_to_migrate[j].parent.split('/')[this.folders_to_migrate[j].parent.split('/').length - 2]
          this.folders_to_migrate.push({
            path: this.folders_to_migrate[j].parent,
            name: folder_slug,
            slug: folder_slug
          })
        }
      }
    }
    this.folders_to_migrate.sort((a, b) => {
      const slashes_in_a = (a.path.match(/\//g) || []).length
      const slashes_in_b = (b.path.match(/\//g) || []).length
      if (slashes_in_a > slashes_in_b) {
        return 1
      }
      return -1
    })
    this.folders_to_migrate = this.folders_to_migrate.filter(f => f.path !== '/')

    // Create the folders
    this.created_folders = await this.storyblok.createFolders(this.folders_to_migrate)

    // Setup the folder id into the stories data as parent_id
    const links = await this.storyblok.getLinks()
    this.stories_to_migrate.filter(s => s._wp_folder).forEach(story => {
      const folder = this.created_folders.find(f => f.path === story._wp_folder)
      if (folder) {
        story.parent_id = folder.id
      } else {
        // If the folder wasn't created in the same session
        // we check if it's already in Storyblok and eventually use its id
        const sb_folder = links.folders.find(l => compareSlugs(l.slug, story._wp_folder))
        if(sb_folder) {
          story.parent_id = sb_folder.id
        }
      }
      delete story._wp_folder
      delete story._wp_link
    })
    if(this.folders_to_migrate.length) {
      console.log(`Folders migrated`)
    }
  }

  /**
   * Return the value of a WordPress field transformed to be sent
   * to Storyblok depending on the fieldtype
   * 
   * @param {Object|String|Array|Number} field_value The value of the field
   * @param {String|Object} field The target field
   * @param {String} component_name The component name
   * @returns {Object|String|Array|Number} The transformed value
   */
  async formatFieldForStoryblok(field_value, field, component_name) {
    if(!field_value) {
      return field_value
    }
    let value, type
    const field_name = typeof field === 'string' ? field : field.field
    if (typeof field === 'object' && field.component_field) {
      type = this.storyblok.getFieldType(field.component, field.component_field)
    } else {
      type = this.storyblok.getFieldType(component_name, field_name)
    }
    switch (type) {
      case 'settings':
        value = Array.isArray(field_value) ? field_value : [field_value]
        break
      case 'richtext':
        value = markdownToRichtext(turndownService.turndown(field_value))
        break
      case 'markdown':
        value = turndownService.turndown(field_value)
        break
      case 'multilink':
        value = {
          url: field_value,
          linktype: 'url',
          fieldtype: 'multilink',
          cached_url: field_value
        }
        break
      case 'datetime':
        value = field_value
        break
      case 'bloks':
        value = await this.getGutenbergBlocks(field_value)
        break
      case 'asset':
        value = {
          filename: field_value,
          fieldtype: 'asset'
        }
        break
      default:
        value = field_value
        break
    }

    if (typeof field === 'object' && field.component_field) {
      return [{
        component: field.component,
        [field.component_field]: value
      }]
    } else {
      return value
    }
  }

  /**
   * Conver an array of Gutenberg blocks to an array of components for
   * Storyblok
   * @param {Array} blocks The blocks array from Gutenberg
   * @returns {Array} The array of components for Storyblok
   */
  async getGutenbergBlocks(blocks) {
    let blocks_data = []
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      let block_data = {}
      const block_mapping = this.settings.blocks_mapping?.find(b => b.name === block.blockName)
      if(block_mapping) {
        // In case there's a custom mapping, it'll be used
        block_data.component = block_mapping.new_block_name || block_mapping.name
        const wp_block_data = await this.populateFields(block, block_data.component, block_mapping.schema_mapping)
        block_data = {...block_data, ...wp_block_data}
      } else {
        // In case no custom mapping is set, the block will be imported
        // as it is in WP
        block_data = {
          component: block.blockName,
          ...block.attrs
        }
      }
      blocks_data.push(block_data)
    }
    return blocks_data
  }

  async populateFields(data, component_name, mapping, taxonomies) {
    let output = {}
    for (const [source, target] of Object.entries(mapping)) {
      let unformatted_field_value =  await this.wp.getFieldValue(data, source)
      if(taxonomies) {
        unformatted_field_value = this.wp.filterTaxonomyValue(taxonomies, unformatted_field_value, source)
      }
      const field_value = await this.formatFieldForStoryblok(unformatted_field_value, target, component_name)
      const target_name = (typeof target === 'string') ? target : target.field
      if (target_name.indexOf('content.') === 0) {
        if(!output.content) output.content = {}
        output.content[target_name.substring(8)] = field_value
      } else {
        output[target_name] = field_value
      }
    }
    return output
  }

  get taxonomiesData() {
    return this.settings.content_types
      .filter(content_type => content_type.taxonomies)
      .map(content_type => content_type.taxonomies.map(taxonomy => {
        const taxonomy_content_type = this.settings.content_types.find(ct => ct.name === taxonomy.name)
        const field_name = typeof content_type.schema_mapping[taxonomy.field] === 'string' ? content_type.schema_mapping[taxonomy.field] : content_type.schema_mapping[taxonomy.field].field
        return {content_type: content_type.new_content_type, field: field_name.replace('content.', ''), taxonomy: taxonomy_content_type.new_content_type, type: taxonomy.type || 'relationship'}
      }))
      .flat()
  }
}
