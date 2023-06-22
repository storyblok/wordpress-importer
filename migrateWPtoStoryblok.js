import { Wp2Storyblok } from './index.js'
import 'dotenv/config'

const wp2storyblok = new Wp2Storyblok('https://news.energysage.com/wp-json', {
  token: process.env.STORYBLOK_OAUTH_TOKEN, // My Account > Personal access tokens
  space_id: process.env.STORYBLOK_SPACE_ID, // Settings
  content_types: [
    {
      name: 'posts', // Post type name in WP
      new_content_type: 'post', // Content Type name in Storyblok
      folder: 'posts', // Destination folder name in Storyblok
      schema_mapping: {
        "date": "first_published_at",
        "title": "name",
        "slug": "slug",
        "_links.wp:featuredmedia.0": "content.featured_image",
        "excerpt": "content.excerpt",
        "content": "content.content",
      },
    },
    {
      name: 'category', // Name of the post type in WP - different from smashing magazine recommended
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
      name: 'author',
      new_content_type: 'author',
      schema_mapping: {
        "first_name": "first_name",
        "last_name": "last_name",
        "email": "email",
        "biographical_info": "biographical_info",
      },
    },
  ]
})

await wp2storyblok.migrate()

console.log("Done!")
