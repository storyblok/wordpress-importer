import axios from "axios"
import "dotenv/config"
import { convert } from "html-to-text"
import StoryblokClient from "storyblok-js-client";

const listOfTags = []

let page_max_i = 1
for (let page_i = 1; page_i <= page_max_i; page_i++) {
    const url = `${process.env.WP_ENDPOINT}/wp/v2/tags/?per_page=100&page=${page_i}`
    const req = await axios.get(url)
    if (page_i === 1) {
        page_max_i = req.headers['X-WP-TotalPages'] || req.headers['x-wp-totalpages']
    }
    const data = req.data
    listOfTags.push(...data)
}

console.log(`Retrieved all ${listOfTags.length} tags, now uploading to storyblok`)

const client = new StoryblokClient({
    oauthToken: process.env.STORYBLOK_OAUTH_TOKEN,
    region: process.env.STORYBLOK_REGION,
})

for (const tag of listOfTags) {
    await client.post(`spaces/${process.env.STORYBLOK_SPACE_ID}/tags`, {
        name: convert(tag.name),
    })
}

console.log('Completed')
