import axios from "axios";
import fs from "fs"
import "dotenv/config"

const listOfData = []

let page_max_i = 1
for (let page_i = 1; page_i <= page_max_i; page_i++) {
    const url = `${process.env.WP_ENDPOINT}/wp/v2/media/?per_page=100&page=${page_i}`
    const req = await axios.get(url)
    if (page_i === 1) {
        page_max_i = req.headers['X-WP-TotalPages'] || req.headers['x-wp-totalpages']
    }
    const data = req.data
    listOfData.push(...data)
}

const dataAsMapping = listOfData.reduce((result, item) => {
    result[item.guid.rendered] = item
    result[item.yoast_head_json.og_url] = item
    return result
}, {})

fs.writeFileSync('media.json', JSON.stringify(dataAsMapping, null, 4))
