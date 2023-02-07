const fs = require('fs/promises')

const util = require('util')
const zlib = require('zlib')
const crypto = require('crypto')

const deflate = util.promisify(zlib.deflate)

;(async () => {
    
    // create config
    await fs.mkdir('./.git', { recursive: true })
    await fs.writeFile('.git/config', `[core]\nrepositoryformatversion = 0\nfilemode = true\nbare = false\nlogallrefupdates = true\nignorecase = true\nprecomposeunicode = true\n`)

    // create blob
    const blobData = '## hello'
    const blobWithMetadata = Buffer.from(`blob ${blobData.length}\x00${blobData}`, 'utf-8')
    const blobBuffer = await deflate(blobWithMetadata)
    const blobSha = crypto.createHash('sha1').update(blobWithMetadata).digest('hex')
    await fs.mkdir(`.git/objects/${blobSha.substring(0, 2)}/`, { recursive: true })
    await fs.writeFile(`.git/objects/${blobSha.substring(0, 2)}/${blobSha.substring(2)}`, blobBuffer)

    // create tree
    const treeChunk = Buffer.from('100644 sample.md\x00', 'utf-8')
    const treeBlob = Buffer.from(blobSha, 'hex')
    const treeData = Buffer.concat([treeChunk, treeBlob])
    const treeMetadata = Buffer.from(`tree ${treeData.length}\x00`, 'utf-8')
    const treeWithMetadata = Buffer.concat([treeMetadata, treeData])
    const treeBuffer = await deflate(treeWithMetadata)
    const treeSha = crypto.createHash('sha1').update(treeWithMetadata).digest('hex')
    await fs.mkdir(`.git/objects/${treeSha.substring(0, 2)}/`, { recursive: true })
    await fs.writeFile(`.git/objects/${treeSha.substring(0, 2)}/${treeSha.substring(2)}`, treeBuffer)

    // create commit
    const timestamp = Date. now() / 1000
    const commitData = `tree ${treeSha}\nauthor Linus Torvalds <torvalds@osdl.org> ${timestamp} +0000\ncommitter Linus Torvalds <torvalds@osdl.org> ${timestamp} +0000\n\nfirst\n`
    const commitWithMetadata = Buffer.from(`commit ${commitData.length}\x00${commitData}`, 'utf-8')
    const commitBuffer = await deflate(commitWithMetadata)
    const commitSha = crypto.createHash('sha1').update(commitWithMetadata).digest('hex')
    await fs.mkdir(`.git/objects/${commitSha.substring(0, 2)}/`, { recursive: true })
    await fs.writeFile(`.git/objects/${commitSha.substring(0, 2)}/${commitSha.substring(2)}`, commitBuffer)

    // create ref
    const refString = Buffer.from(commitSha, 'utf-8')
    await fs.mkdir('./.git/refs/heads', { recursive: true })
    await fs.writeFile('.git/refs/heads/master', refString)
    await fs.writeFile('.git/HEAD', 'ref: refs/heads/master\n')

})()

