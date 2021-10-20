export const getDescendantProp = (obj, path) => (
  path.split('.').reduce((acc, part) => acc && acc[part], obj)
)

export const normalizePath = (path) => {
  return path.replace(/^\/|\/$/g, '')
}

export const compareSlugs = (slug1, slug2) => {
  return normalizePath(slug1) === normalizePath(slug2)
}

export const getAssetData = (url) => {
  return {
    filename: url.split('?')[0].split('/').pop(),
    folder: `./temp/${url.split('?')[0].split('/').slice(0, -1).pop()}`,
    filepath: `./temp/${url.split('?')[0].split('/').slice(0, -1).pop()}/${url.split('?')[0].split('/').pop()}`,
    ext: url.split('?')[0].split('/').pop().split('.').pop()
  }
}