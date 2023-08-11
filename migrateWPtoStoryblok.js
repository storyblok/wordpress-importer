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
const old_slug_to_data = records.reduce((result, record) => {
    const oldUrlParts = record[0].split('/')
    const oldSlug = oldUrlParts[oldUrlParts.length - 2]
    const newUrlParts = record[1].split('/')
    const newSlug = newUrlParts[newUrlParts.length - 2]
    const newFolderParts = newUrlParts.slice(3, newUrlParts.length - 2)
    const folder = `/${newFolderParts.join('/')}/`
    const title = record[2].replace(' | EnergySage', '')
    const description = record[3]
    result[oldSlug] = {
        newSlug,
        title,
        description,
        folder,
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
const tablePressJsonDirectoryPath = path.resolve('./tablepress_export')
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

const handleImage = (block) => {
    const maybeAsset = wp2storyblok.getMediaValue(block.attrs.url)
    if (maybeAsset) {
        return {
            component: 'ArticleImage',
            image: maybeAsset,
        }
    } else {
        return fallbackWpToStoryblok(block)
    }
}

const getTitle = (data, sentenceCase = true) => {
    let title = old_slug_to_data[data.slug].title
    if (sentenceCase) {
        title = convertToSentenceCase(title)
    }
    return title
}

const getPath = (data) => {
    return `${old_slug_to_data[data.slug].folder}${data.slug}/`
}

const getRealPath = (data) => {
    return `${data.slug}/?preview=true`
}

const getSeoData = (data) => {
    const title = getTitle(data, false)
    const descriptionFromPlan = old_slug_to_data[data.slug].description
    const description = (descriptionFromPlan && descriptionFromPlan !== '-') ? descriptionFromPlan
        : data.yoast_head_json.description
    if (!title) {
        console.warn(`Title is falsy for ${data.slug}`)
    }
    if (!description) {
        console.warn(`Description is falsy for ${data.slug}`)
    }
    return {
        'plugin': 'seo_metatags',
        'title': title,
        'description': description,
        'og_title': title,
        'og_description': description,
        'og_image': data.yoast_head_json.og_image?.map(entry => entry.url),
    }
}

export const slugToSentenceCaseTitle = (slug) => {
    const words = slug.split("-");
    const sentenceCaseWords = words.map((word, index) => {
        let firstLetter = word.charAt(0)
        if (index === 0) {
            firstLetter = firstLetter.toUpperCase()
        } else {
            firstLetter = firstLetter.toLowerCase()
        }
        return firstLetter + word.slice(1).toLowerCase();
    });

    return sentenceCaseWords.join(" ");
}

function convertToSentenceCase(title) {
    const capitalizeFirstLetterOnly = (word) => {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    };

    const words = title.split(" ");
    const sentenceCaseTitle = [];

    if (words.length > 0) {
        sentenceCaseTitle.push(capitalizeFirstLetterOnly(words[0]));
    }

    for (let i = 1; i < words.length; i++) {
        let word = words[i]
        if (words[i - 1].endsWith(':')) {
            word = capitalizeFirstLetterOnly(word)
        } else {
            word = word.toLowerCase()
        }
        sentenceCaseTitle.push(word);
    }

    return sentenceCaseTitle.join(" ");
}

const getArticleBreadcrumbList = (data) => {
    const folders = old_slug_to_data[data.slug].folder.split('/')
    const innerBreadcrumbs = []
    for (let i = 1; i < folders.length - 1; i++) {
        const folder = folders[i]
        const fullPath = `/${folders.slice(1, i + 1).join('/')}/`
        innerBreadcrumbs.push({
            component: 'ArticleBreadcrumb',
            name: slugToSentenceCaseTitle(folder),
            url: {
                url: fullPath,
                linktype: 'url',
                fieldtype: 'multilink',
                cached_url: fullPath,
            },
        })
    }
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
            ...innerBreadcrumbs,
        ],
    }]
}

const tagIdToName = new Map()

const getTags = async (data) => {
    const tagNames = []
    for (const tagId of data.tags) {
        if (!tagIdToName.has(tagId)) {
            const url = `${wp2storyblok.wp.endpoint}/wp/v2/tags/${tagId}/`
            const req = await axios.get(url)
            tagIdToName.set(tagId, req.data.name)
        }
        tagNames.push(tagIdToName.get(tagId))
    }
    return tagNames.join(', ')
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
                const url = `${process.env.WP_BASE_URL}/wp-json/wp/v2/categories/${categoryId}/`
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
        header: getTitle(data, true),
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

const getFolder = (wp_entry) => {
    const entryData = old_slug_to_data[wp_entry.slug]
    return entryData.folder
}

const wp2storyblok = new Wp2Storyblok(`${process.env.WP_BASE_URL}/wp-json`, slugs, {
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
            custom_handler: handleImage,
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
            folder: getFolder,
            schema_mapping: new Map([
                ["date", "first_published_at"],
                [getTitle, "name"],
                ["slug", "slug"],
                [getRealPath, "path"],
                [getTags, "content.legacyTags"],
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
