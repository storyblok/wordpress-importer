import { Wp2Storyblok } from './index.js'
import 'dotenv/config'

const wp2storyblok = new Wp2Storyblok(process.env.WP_ENDPOINT, {
  token: process.env.STORYBLOK_OAUTH_TOKEN, // My Account > Personal access tokens
  space_id: process.env.STORYBLOK_SPACE_ID, // Settings
  blocks_mapping: [
    {
      name: 'core/paragraph',
      new_block_name: 'richText',
      schema_mapping: {
        'attrs.content': 'content',
      },
    },
    {
      name: 'core/image',
      new_block_name: 'image',
      schema_mapping: {
        'attrs.url': 'image',
      },
    },
    {
      name: 'core/group',
      new_block_name: 'group',
      schema_mapping: {
        'innerBlocks': 'bodyItems',
      },
    },
    {
      name: 'core/heading',
      new_block_name: 'heading',
      schema_mapping: {
        'attrs.level': 'level',
        'attrs.content': 'content',
      },
    },
  ],
  content_types: [
    {
      name: 'posts', // Post type name in WP
      new_content_type: 'post', // Content Type name in Storyblok
      folder: 'posts', // Destination folder name in Storyblok
      taxonomies: [
        {
          name: 'categories',
          field: 'categories',
          type: 'relationship',
        },
        {
          name: 'users',
          field: 'author',
          type: 'relationship',
        },
      ],
      schema_mapping: {
        "date": "first_published_at",
        "title": "name",
        "slug": "slug",
        "_links.wp:featuredmedia.0": "content.featured_image",
        "author": "content.author",
        "categories": "content.categories",
        "excerpt": "content.excerpt",
        "block_data": "content.body_items",
      },
    },
    {
      name: 'categories', // Name of the post type in WP
      new_content_type: 'category', // Name of the Content Type in Storyblok
      // By default will be contained by a folder called Category (change it in the Permalinks option in WP)
      schema_mapping: {
        "name": "name",
        "slug": "slug",
        "description": "content.description",
        "parent": "content.parent",
      },
    },
    {
      name: 'users',
      new_content_type: 'author',
      schema_mapping: {
        "name": "name",
        "slug": "slug",
        "description": "content.description",
      },
    },
  ]
})

await wp2storyblok.migrate()

console.log("Done!")
