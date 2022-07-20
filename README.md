<div align="center">
	<a  href="https://www.storyblok.com?utm_source=github.com&utm_medium=readme&utm_campaign=wordpress-importer"  align="center">
		<img  src="https://a.storyblok.com/f/88751/1776x360/ffa245ed47/sb-wp-git-hero.png"  alt="Storyblok Logo">
	</a>
	<h1  align="center">Storyblok WordPress importer</h1>
	<p  align="center">A simple script for migrating content from WordPress to <a href="https://www.storyblok.com?utm_source=github.com&utm_medium=referral&utm_campaign=wordpress-importer">Storyblok</a>.</p>
</div>

<p align="center">
  <a href="https://discord.gg/jKrbAMz">
   <img src="https://img.shields.io/discord/700316478792138842?label=Join%20Our%20Discord%20Community&style=appveyor&logo=discord&color=09b3af">
   </a>
  <a href="https://twitter.com/intent/follow?screen_name=storyblok">
    <img src="https://img.shields.io/badge/Follow-%40storyblok-09b3af?style=appveyor&logo=twitter" alt="Follow @Storyblok" />
  </a><br/>
  <a href="https://app.storyblok.com/#!/signup?utm_source=github.com&utm_medium=readme&utm_campaign=wordpress-importer">
    <img src="https://img.shields.io/badge/Try%20Storyblok-Free-09b3af?style=appveyor&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAYAAAA7MK6iAAAABGdBTUEAALGPC/xhBQAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAHqADAAQAAAABAAAAHgAAAADpiRU/AAACRElEQVRIDWNgGGmAEd3D3Js3LPrP8D8WXZwSPiMjw6qvPoHhyGYwIXNAbGpbCjbzP0MYuj0YFqMroBV/wCxmIeSju64eDNzMBJUxvP/9i2Hnq5cM1devMnz984eQsQwETeRhYWHgIcJiXqC6VHlFBjUeXgav40cIWkz1oLYXFmGwFBImaDFBHyObcOzdW4aSq5eRhRiE2dgYlpuYoYSKJi8vw3GgWnyAJIs/AuPu4scPGObd/fqVQZ+PHy7+6udPOBsXgySLDfn5GRYYmaKYJcXBgWLpsx8/GPa8foWiBhuHJIsl2DkYQqWksZkDFgP5PObcKYYff//iVAOTIDlx/QPqRMb/YSYBaWlOToZIaVkGZmAZSQiQ5OPtwHwacuo4iplMQEu6tXUZMhSUGDiYmBjylFQYvv/7x9B04xqKOnQOyT5GN+Df//8M59ASXKyMHLoyDD5JPtbj42OYrm+EYgg70JfuYuIoYmLs7AwMjIzA+uY/zjAnyWJpDk6GOFnCvrn86SOwmsNtKciVFAc1ileBHFDC67lzG10Yg0+SjzF0ownsf/OaofvOLYaDQJoQIGix94ljv1gIZI8Pv38zPvj2lQWYf3HGKbpDCFp85v07NnRN1OBTPY6JdRSGxcCw2k6sZuLVMZ5AV4s1TozPnGGFKbz+/PE7IJsHmC//MDMyhXBw8e6FyRFLv3Z0/IKuFqvFyIqAzd1PwBzJw8jAGPfVx38JshwlbIygxmYY43/GQmpais0ODDHuzevLMARHBcgIAQAbOJHZW0/EyQAAAABJRU5ErkJggg==" alt="Follow @Storyblok" />
  </a>
</p>

## 🚀 Usage

### Prerequisets
This script has been tested on WordPress v5 with API v2. WordPress REST API must be publicly available during the migration process as this script won't handle authentication.
On the <a href="https://www.storyblok.com" target="_blank">Storyblok</a> side you just need a space. In case the space is not an empty one, we recommend to test it before with a copy of the original space to make sure the migration process doesn't cause an issue to the existing content. 

### How to use
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

#### Fields Mapping
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

#### WordPress Blocks Mapping
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

#### Importing Taxonomies
Taxonomies can be imported along with the other fields. You need to fill out the `taxonomies` settings in the settings of your `content_type` and the script will get the taxonomy value from WordPress instead of the taxonomy id and it will add it to your Stories in the field you chose. 

## 🔗 Related Links


* **[How To Migrate From WordPress To A Headless CMS](https://www.smashingmagazine.com/2021/07/wordpress-headless-cms-storyblok/)**: In this article, we will look at when it makes sense to migrate from a monolithic project to a headless setup and the benefits that come with it. In addition to a step-by-step guide on how to migrate WordPress to Storyblok Headless CMS, the problems that will arise during the process and how to deal with them;  
* **[Storyblok Technologies Hub](https://www.storyblok.com/technologies?utm_source=github.com&utm_medium=referral&utm_campaign=wordpress-importe)**: we prepared technology hubs so that you can find selected beginner tutorials, videos, boilerplates, and even cheatsheets all in one place.

## ℹ️ More Resources

### Support

* Bugs or Feature Requests? [Submit an issue](../../issues/new);

* Do you have questions about Storyblok or you need help? [Join our Discord Community](https://discord.gg/jKrbAMz).

### Contributing

Please see our [contributing guidelines](https://github.com/storyblok/.github/blob/master/contributing.md) and our [code of conduct](https://www.storyblok.com/trust-center#code-of-conduct?utm_source=github.com&utm_medium=readme&utm_campaign=wordpress-importer).
This project use [semantic-release](https://semantic-release.gitbook.io/semantic-release/) for generate new versions by using commit messages and we use the Angular Convention to naming the commits. Check [this question](https://semantic-release.gitbook.io/semantic-release/support/faq#how-can-i-change-the-type-of-commits-that-trigger-a-release) about it in semantic-release FAQ.

### License

This repository is published under the [MIT](./LICENSE) license.
