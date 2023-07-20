import {Wp2Storyblok} from './index.js'
import {fallbackWpToStoryblok, turndownService} from './src/migration.js'
import 'dotenv/config'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import * as path from "path"
import {convert as rawConvert} from "html-to-text";
import axios from "axios";
import pkg from "storyblok-markdown-richtext";
const { markdownToRichtext } = pkg;
import { parse } from 'csv-parse/sync';

const convert = (input) => {
    return rawConvert(input, {
        selectors: [
            { selector: 'a', options: { ignoreHref: true }},
        ],
    })
}

// Load in the slugs of articles we want to migrate.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, 'migration_plan.csv');
const data = fs.readFileSync(filePath, 'utf-8');
const records = parse(data)
const old_slug_to_data = records.map(record => {
    const oldUrlParts = record[0].split('/')
    const oldSlug = oldUrlParts[oldUrlParts.length - 2]
    const newUrlParts = record[1].split('/')
    const newSlug = newUrlParts[newUrlParts.length - 2]
    const title = record[2].replace(' | EnergySage', '')
    const description = record[3]
    return [
        oldSlug,
        newSlug,
        title,
        description,
    ]
}).reduce((result, record) => {
    result[record[0]] = {
        newSlug: record[1],
        title: record[2],
        description: record[3],
    }
    return result
}, {})
const slugs = Object.keys(old_slug_to_data)

// Load in the author mapping
const authorFilePath = path.join(__dirname, 'author_mapping.txt');
const authorData = fs.readFileSync(authorFilePath, 'utf-8')
const authorLines = authorData.split('\n')
const authorMapping = authorLines.reduce((result, author) => {
    const parts = author.split(' (')
    const oldUrl = parts[0]
    result[oldUrl] = parts[1].split(')')[0]
    return result
}, {})

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
            thead = jsonObj.data[0].map(colHead => ({value: convert(colHead)}))
            tbody = jsonObj.data.slice(1).map(row => ({body: row.map(colItem => ({value: convert(colItem)}))}))
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

const handleShortcode = async (block) => {
    if (block.innerContent.length !== 1) {
        console.error('handleShortcode got unexpected innerContent length')
    } else if (block.innerContent[0].includes('[table id=')) {
        const tableId = block.innerContent[0].match(/table id=(\d+)/)[1]
        return tableIdToBlockData[tableId]
    } else {
        console.error(`handleShortcode got unexpected shortcode type ${block.innerContent[0]}`)
    }
    return fallbackWpToStoryblok(block)
}

const handleHeading = (block) => {
    if (block.attrs.level <= 2) {
        return {
            component: 'ArticleH2',
            text: convert(block.attrs.content),
        }
    } else {
        return {
            component: 'ArticleRichContent',
            content: markdownToRichtext(turndownService.turndown(block.innerHTML)),
        }
    }
}

const handleGroup = (block) => {
    if (block.innerBlocks.length === 3 && block.innerBlocks[0].blockName === 'core/heading'
        && block.innerBlocks[0].attrs.content.toLowerCase() === 'key takeaways'
        && block.innerBlocks[1].blockName === 'core/separator' && block.innerBlocks[2].blockName === 'core/list') {

        return {
            component: 'ArticleTakeAways',
            heading: block.innerBlocks[0].attrs.content,
            content: [
                {
                    component: 'ArticleRichContent',
                    content: markdownToRichtext(turndownService.turndown(block.innerBlocks[2].rendered)),
                },
            ],
        }
    } else {
        return wp2storyblok.formatBloksField(block.innerBlocks)
    }
}

const getTitle = (data) => {
    return old_slug_to_data[data.slug].title
}

const getPath = (data) => {
    return `/blog/${data.slug}/`
}

const getRealPath = (data) => {
    return `${getPath(data)}?preview=true`
}

const getSeoData = (data) => {
    const descriptionFromPlan = old_slug_to_data[data.slug].description
    const description = (descriptionFromPlan && descriptionFromPlan !== '-') ? descriptionFromPlan
        : data.yoast_head_json.description
    return {
        'plugin': 'seo_metatags',
        'title': old_slug_to_data[data.slug].title,
        'description': description,
    }
}

const getArticleBreadcrumbList = (data) => {
    return [{
        component: 'ArticleBreadcrumbList',
        breadcrumbList: [
            {
                component: 'ArticleBreadcrumb',
                name: 'Home',
                url: {
                    url: '/',
                    linktype: 'url',
                    fieldtype: 'multilink',
                    cached_url: '/',
                },
            },
            {
                component: 'ArticleBreadcrumb',
                name: 'Blog',
                url: {
                    url: '/blog/',
                    linktype: 'url',
                    fieldtype: 'multilink',
                    cached_url: '/blog/',
                },
            },
            {
                component: 'ArticleBreadcrumb',
                name: old_slug_to_data[data.slug].title,
                url: {
                    url: `/${getPath(data)}`,
                    linktype: 'url',
                    fieldtype: 'multilink',
                    cached_url: `/${getPath(data)}`,
                }
            },
        ],
    }]
}

const newAuthorSlugToUuid = new Map()

const missingAuthors = []

const categoryIdToSlug = new Map()

const getArticleEeat = async (data) => {
    const url = `https://www.energysage.com/blog/${data.slug}/`
    const authorOldUrl = data.yoast_head_json.schema['@graph'].find(t => t['@type'] === 'Person').url
    const authorNewSlug = authorMapping[authorOldUrl]
    let authorUuid
    if (newAuthorSlugToUuid.has(authorNewSlug)) {
        authorUuid = newAuthorSlugToUuid.get(authorNewSlug)
    } else {
        const res = await wp2storyblok.storyblok.client.get(`spaces/${wp2storyblok.storyblok.space_id}/stories`, {
          by_slugs: `authors/${authorNewSlug}`,
          content_type: 'AuthorPage',
        })
        if(res.data.stories?.length) {
            if (res.data.stories.length !== 1) {
                console.error(`Unexpectedly got more than one author for ${data.slug}: ${res.data.stories}`)
            }
            authorUuid = res.data.stories[0].uuid
        } else {
            missingAuthors.push(authorNewSlug)
            authorUuid = null
        }
        newAuthorSlugToUuid.set(authorNewSlug, authorUuid)
    }

    let categorySlugs = undefined
    if (data.categories.length > 0) {
        const categorySlugsList = []
        for (const categoryId of data.categories) {
            if (!categoryIdToSlug.has(categoryId)) {
                const url = `${process.env.WP_ENDPOINT}/wp/v2/categories/${categoryId}/`
                const req = await axios.get(url)
                const slug = req.data.slug
                categoryIdToSlug.set(categoryId, slug)
            }
            const categorySlug = categoryIdToSlug.get(categoryId)
            categorySlugsList.push(categorySlug)
        }
        categorySlugs = categorySlugsList.join(', ')
    }

    let lede = undefined
    const firstParagraph = data.block_data.find(el => el.blockName === 'core/paragraph')
    if (firstParagraph) {
        lede = convert(firstParagraph.attrs.content)
    }

    return [{
        component: 'ArticleEeat',
        header: old_slug_to_data[data.slug].title,
        authors: authorUuid ? [authorUuid] : [],
        // This has been removed from Storyblok temporarily(?)
        // editorialGuidelines: process.env.EDITORIAL_GUIDELINES_UUID,
        legacyUpdatedDate: `${(new Date(data.modified)).toISOString().slice(0, 10)} 00:00`,
        canonicalUrl: {
            id: '',
            url: url,
            linktype: 'url',
            fieldtype: 'multilink',
            cached_url: url,
        },
        category: categorySlugs,
        lede: lede,
        // It's annoying that default values have to be manually copied
        copyTooltipSuccess: 'Link copied!',
        copyWrittenBy: 'Written By: {authors}',
        copyEditedBy: 'Edited By: {authorName}',
        copyUpdated: 'Updated {updatedDate}',
        copyPublished: 'Published {publishDate}',
        copyReadTimeMinutes: '{num} min read',
    }]
}

const getArticleToc = (data) => {
    return [{
        component: 'ArticleTableOfContents',
        header: 'Table of contents',
    }]
}

const wp2storyblok = new Wp2Storyblok(process.env.WP_ENDPOINT, slugs, {
    token: process.env.STORYBLOK_OAUTH_TOKEN, // My Account > Personal access tokens
    space_id: process.env.STORYBLOK_SPACE_ID, // Settings
    blocks_mapping: [
        {
            name: 'core/paragraph',
            new_block_name: 'ArticleRichContent',
            schema_mapping: new Map([
                ['attrs.content', 'content'],
            ]),
        },
        // DISABLED BECAUSE OF BUG IN STORYBLOK, SEE CED-771
        // {
        //     name: 'core/separator',
        //     new_block_name: 'ArticleParagraph',
        //     schema_mapping: new Map([
        //         ['rendered', 'content'],
        //     ]),
        // },
        {
            name: 'core/more',
            ignore: true,
        },
        {
            name: 'core/list',
            new_block_name: 'ArticleRichContent',
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
            custom_handler: handleGroup,
        },
        {
            name: 'core/heading',
            custom_handler: handleHeading,
        },
        {
            name: 'shortcoder/shortcoder',
            custom_handler: handleShortcode,
        },
        {
            name: 'core/shortcode',
            custom_handler: handleShortcode,
        },
    ],
    content_types: [
        {
            name: 'posts', // Post type name in WP
            new_content_type: 'ArticlePage001', // Content Type name in Storyblok
            folder: '/blog/', // Destination folder name in Storyblok
            schema_mapping: new Map([
                ["date", "first_published_at"],
                [getTitle, "name"],
                ["slug", "slug"],
                [getRealPath, "path"],
                [getSeoData, "content.seo"],
                ["_links.wp:featuredmedia.0", {
                    "field": "content.articleImage",
                    "component": "ArticleImage",
                    "component_field": "image",
                }],
                [getArticleBreadcrumbList, "content.articleBreadcrumbList"],
                [getArticleEeat, "content.articleEeat"],
                [getArticleToc, "content.articleTableOfContents"],
                ["block_data", "content.body"],
            ]),
        },
    ]
})

await wp2storyblok.migrate()

if (missingAuthors.length > 0) {
    console.warn(`Missing authors: ${missingAuthors}`)
}

console.log("Done!")
