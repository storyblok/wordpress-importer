import {Wp2Storyblok} from './index.js'
import {fallbackWpToStoryblok} from './src/migration.js'
import 'dotenv/config'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import * as path from "path"

// Load in the slugs of articles we want to migrate.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, 'escargatoire.txt');
const data = fs.readFileSync(filePath, 'utf-8');
const urls = data.split('\n');
const slugs = urls.map(url => {
  let parts = url.split('/');
  return parts[parts.length - 2];
});

// Handle the tablepress tables
const tablePressJsonDirectoryPath = process.env.TABLEPRESS_EXPORT_DIRECTORY_PATH
const files = fs.readdirSync(tablePressJsonDirectoryPath);
let tableIdToBlockData = {}
files.forEach((file) => {
    if (path.extname(file) === '.json') {
        let filePath = path.join(tablePressJsonDirectoryPath, file);
        const data = fs.readFileSync(filePath, 'utf8');
        const jsonObj = JSON.parse(data);
        let thead = undefined
        let tbody = undefined
        if (jsonObj.options.table_head) {
            thead = jsonObj.data[0].map(colHead => ({value: colHead}))
            tbody = jsonObj.data.slice(1).map(row => ({body: row.map(colItem => ({value: colItem}))}))
        }
        tableIdToBlockData[jsonObj.id] = {
            component: 'ArticleDataTable',
            stickyHeader: '',
            sortableHeaders: '',
            table: {
                fieldtype: 'table',
                thead: thead,
                tbody: tbody,
            }
        }
    }
});

const handleShortcoderShortcode = async (block) => {
    if (block.innerContent.length !== 1) {
        console.error('handleShortcoderShortcode got unexpected innerContent length')
    } else if (block.innerContent[0] === '\n[sc name="zip_cta_bottom" ][/sc]\n') {
        return {
            component: 'ArticleZipCtaBottom',
        }
    } else if (block.innerContent[0].startsWith('\n[table id=')) {
        const tableId = block.innerContent[0].match(/table id=(\d+)/)[1]
        return tableIdToBlockData[tableId]
    } else {
        console.error(`handleShortcoderShortcode got unexpected shortcode type ${block.innerContent[0]}`)
    }
    return fallbackWpToStoryblok(block)
}

const getRealPath = (data) => {
    return `blog/${data.slug}/?preview=true`
}

const getArticleEeat = (data) => {
    const url = `https://www.energysage.com/blog/${data.slug}/`
    return [{
        component: 'ArticleEeat',
        header: data.title.rendered,
        canonicalUrl: {
            id: '',
            url: url,
            linktype: 'url',
            fieldtype: 'multilink',
            cached_url: url,
        },
        // It's annoying that default values have to be manually copied
        copyTooltipSuccess: 'Link copied!',
        copyWrittenBy: 'Written By:',
        copyEditedBy: 'Edited By: {authorName}',
        copyUpdated: 'Updated {updatedDate}',
        copyPublished: 'Published {publishDate}',
        copyViewFullProfile: 'View full profile',
        copyReadTimeMinutes: '{num} min read',
    }]
}

const wp2storyblok = new Wp2Storyblok(process.env.WP_ENDPOINT, slugs, {
    token: process.env.STORYBLOK_OAUTH_TOKEN, // My Account > Personal access tokens
    space_id: process.env.STORYBLOK_SPACE_ID, // Settings
    blocks_mapping: [
        {
            name: 'core/paragraph',
            new_block_name: 'ArticleParagraph',
            schema_mapping: new Map([
                ['attrs.content', 'content'],
            ]),
        },
        {
            name: 'core/more',
            ignore: true,
        },
        {
            name: 'core/list',
            new_block_name: 'ArticleList',
            schema_mapping: new Map([
                ['rendered', 'content'],
            ]),
        },
        {
            name: 'core/image',
            new_block_name: 'ArticleImage',
            schema_mapping: new Map([
                ['attrs.url', 'image'],
            ]),
        },
        {
            name: 'core/group',
            new_block_name: 'ArticleGroup',
            schema_mapping: new Map([
                ['innerBlocks', 'body'],
            ]),
        },
        {
            name: 'core/heading',
            new_block_name: 'ArticleHeading',
            schema_mapping: new Map([
                ['attrs.level', 'level'],
                ['attrs.content', 'content'],
            ]),
        },
        {
            name: 'shortcoder/shortcoder',
            custom_handler: handleShortcoderShortcode,
        }
    ],
    content_types: [
        {
            name: 'posts', // Post type name in WP
            new_content_type: 'ArticlePage001', // Content Type name in Storyblok
            folder: '/articles/blog/', // Destination folder name in Storyblok
            // taxonomies: [
            //     {
            //         name: 'categories',
            //         field: 'categories',
            //         type: 'relationship',
            //     },
            //     {
            //         name: 'users',
            //         field: 'author',
            //         type: 'relationship',
            //     },
            // ],
            schema_mapping: new Map([
                ["date", "first_published_at"],
                ["title", "name"],
                ["slug", "slug"],
                [getRealPath, "path"],
                ["_links.wp:featuredmedia.0", {
                    "field": "content.ArticleImage",
                    "component": "ArticleImage",
                    "component_field": "image",
                }],
                // "author": "content.author",
                // "categories": "content.categories",
                // "excerpt": "content.excerpt",
                // "date_gmt": {
                //     "field": "content.body_items",
                //     "component": "pocNestedBlockFromFlat",
                //     "component_field": "dateGmt",
                // },
                [getArticleEeat, "content.ArticleEeat"],
                ["block_data", "content.body"],
            ]),
        },
        // {
        //     name: 'categories', // Name of the post type in WP
        //     new_content_type: 'category', // Name of the Content Type in Storyblok
        //     // By default will be contained by a folder called Category (change it in the Permalinks option in WP)
        //     schema_mapping: {
        //         "name": "name",
        //         "slug": "slug",
        //         "description": "content.description",
        //         "parent": "content.parent",
        //     },
        // },
        // {
        //     name: 'users',
        //     new_content_type: 'author',
        //     schema_mapping: {
        //         "name": "name",
        //         "slug": "slug",
        //         "description": "content.description",
        //     },
        // },
    ]
})

await wp2storyblok.migrate()

console.log("Done!")
