<div style="text-align: center;">
  <h1>WordPerss Importer for Storyblok</h1>
  <p>A simple script for migrating content from WordPress to <a href="https://www.storyblok.com" target="_blank">Storyblok</a>.</p>
</div>

## Prerequisets
This script has been tested on WordPress v5 with API v2. WordPress REST API must be publicly available during the migration process as this script won't handle authentication.
On the <a href="https://www.storyblok.com" target="_blank">Storyblok</a> side you just need a space. In case the space is not an empty one, we recommend to test it before with a copy of the original space to make sure the migration process doesn't cause an issue to the existing content. 

## How to use
To use the script, just import it, initialise a new instance of the `Wp2Storyblok` class and run the `Wp2Storyblok.migrate()` method.

```javascript
import {Wp2Storyblok} from './index.js'

const wp2storyblok = new Wp2Storyblok('http://yoursite.com/wp-json', {
  token: 'storyblok-oauth-token',
  space_id: 110836,
  blocks_mapping: [
    {
      name: 'core/paragraph',
      new_block_name: 'richtext',
      schema_mapping: {
        'attrs.content': 'content'
      }
    },
    {
      name: 'core/image',
      new_block_name: 'image',
      schema_mapping: {
        'attrs.url': 'image'
      }
    }
  ],
  content_types: [
    {
      name: 'pages',
      new_content_type: 'page',
      folder: 'your-custom-folder',
      taxonomies: [
        {
          name: 'categories',
          field: 'categories',
          type: 'value'
        }
      ],
      schema_mapping: {
        title: 'name',
        '_links.wp:featuredmedia.0': 'content.preview_image',
        content: {
          field: 'content.body_items',
          component: 'rich-text',
          component_field: 'content',
          categories: 'content.categories'
        }
      }
    }
  ]
})

wp2storyblok.migrate()
```

**Parameters**

- `endpoint` String, The main endpoint for the WordPress REST API, without the `/wp/v2/` part
- `config` Object
  - `token` String, The oauth token for the management API that can be retrieved in the account section of https://app.storyblok.com
  - `space_id` Integer, The id of your space
  - `content_types` Array of Objects
    - `name` String, The name of the content type in WordPress
    - `new_content_type` String, The name of the content type in Storyblok
    - `schema_mapping` Object, The mapping of the fields from WordPress to the fields in Storyblok. More info about the mapping [here](#fields-mapping)
  - (`blocks_mapping` Array of Objects, Optional, More info [here](#wordpress-blocks-mapping))
    - `name` String, The name of the block in WordPress
    - (`new_block_name` String, Optional, The name of the component in Storyblok. If not set the original name of the component will be used)
    - `schema_mapping` Object, The mapping of the fields from WordPress to the fields in Storyblok. More info about the mapping [here](#fields-mapping)
  - (`taxonomies` Array of Objects, Optional, The taxonomies of the content type, More info [here](#importing-taxonomies))
    - `name` String, The name of the taxonomy in WordPress
    - `field` String, The name of the source field in WordPress
    - (`type` String, Set to `value` to replace the taxonomy id with the slug of the taxonomy value. Set to `relationship` or leave empty in case you imported also the taxonomy entries as stories and you want to link the taxonomy entry with an option or multi-option field by UUID )
  - (`folder` String, Optional, The full slug of the destination folder in Storyblok)

### Fields Mapping
The fields mapping object requires you to use the name of the field from WordPress as keys of the attributes and the name of the field in Storyblok as its value. You can also target subproperties and array elements using the dot notation.

```json
"schema_mapping": {
  "_links.wp:featuredmedia.0": "content.preview_image"
}
```
In case you want a field to be migrated as content inside a nested block in a field in Storyblok, you can do that defining the target as an object with the following properties:

- `field` String, The name of the field in Storyblok
- `component` String, The name of the component you want to store inside the above field
- `component_field` String, The name of the field inside the component where you want to migrate the content

```json
"schema_mapping": {
  "content": {
    "field": "content.body_items", 
    "component": "rich-text", 
    "component_field": "content" 
  }
}
```

### WordPress Blocks Mapping
You can import blocks created with Gutenber as components in Storyblok. To achieve this you need to install the [REST API blocks plugin](https://wordpress.org/plugins/rest-api-blocks/) and fill out the `blocks_mapping` property in the migration settings.
You need to create an array of objects where you specify the name of the block from Gutenberg (called `blockName` in the REST API), the name of the component in Storyblok and then the schema mapping in the same format as for the content types. 
The blocks from Gutenberg are returned by the REST API inside the main object of an entry in a property called `blocks`. 

```json
  {
    "name": "pages",
    "new_content_type": "page",
    "folder": "",
    "schema_mapping": {
      "title": "name",
      "blocks": "content.body"
    },
  },
```

### Importing Taxonomies
Taxonomies can be imported along with the other fields. You need to fill out the `taxonomies` settings in the settings of your `content_type` and the script will get the taxonomy value from WordPress instead of the taxonomy id and it will add it to your Stories in the field you chose. 