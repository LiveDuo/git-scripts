const http = require('http')
const url = require('url')
const util = require('util')
const zlib = require('zlib')
const crypto = require('crypto')

const port = 5000

const deflate = util.promisify(zlib.deflate)

const getWithHeader = (s) => (s.length + 4).toString(16).padStart(4, '0') + s

const getObjectType = (t) => (t === 'commit') ? '001' : (t === 'tree') ? '010' : (t === 'blob') ? '011' : ''

const getObjectHeader = (size, type) => {
    const s = size.toString(2)
    const b = (size > 15 ? '1' : '0') + getObjectType(type) + s.slice(-4).toString(2)
    let result = parseInt(b, 2).toString(16)
    if (size > 15) {
        const groups = s.substring(0, s.length - 4).toString(2).match(/(.{1,7})/g)
        const left = groups.reverse().map((r, i) => (i < groups.length -1 ? '1' : '0') + r.padStart(7, '0'))
        result += parseInt(left.join(''), 2).toString(16).padStart(2, '0')
    }
    return result
}

const createRepository = async () => {
	
	// blob
	const blobData = Buffer.from('# hello world\x0a', 'utf8')
	const blobObject = await deflate(blobData)
	const blobWithMetadata = Buffer.concat([Buffer.from(`blob ${blobData.byteLength}\x00`, 'utf8'), blobData])
	const blobSha = crypto.createHash('sha1').update(blobWithMetadata).digest('hex')
	const blob = {zlib: blobObject, data: blobData, id: blobSha}
	
	// tree
	const treeChunk = Buffer.from('100644 test.md\x00', 'utf8')
	const treeBlob = Buffer.from(blobSha, 'hex')
	const treeData = Buffer.concat([treeChunk, treeBlob])
	const treeObject = await deflate(treeData)
	const treebWithMetadata = Buffer.concat([Buffer.from(`tree ${treeData.byteLength}\x00`, 'utf8'), treeData])
	const treeSha = crypto.createHash('sha1').update(treebWithMetadata).digest('hex')
	const tree = {zlib: treeObject, data: treeData, id: treeSha}

	// commit
	const timestamp = Math.floor(Date.now() / 1000)
	const commitData = Buffer.from(`tree ${treeSha}\ncommitter name <s@s.com> ${timestamp} +0000\n\ninitial commit\n`, 'utf8')
	const commitObject = await deflate(commitData)
	const commitbWithMetadata = Buffer.concat([Buffer.from(`commit ${commitData.byteLength}\x00`, 'utf8'), commitData])
	const commitSha = crypto.createHash('sha1').update(commitbWithMetadata).digest('hex')
	const commit = {zlib: commitObject, data: commitData, id: commitSha}

	return {blob, tree, commit}
}

const getInfoRefs = async (_req, res, {commit}) => {

	res.setHeader('Content-Type', `application/x-git-upload-pack-advertisement`)

	// service
	res.write(Buffer.from(getWithHeader('# service=git-upload-pack\x0a'), 'utf8'))
	res.write(Buffer.from('0000', 'utf8'))

	// refs
	res.write(Buffer.from(getWithHeader(`${commit.id} HEAD\x00side-band multi_ack_detailed\x0a`), 'utf8'))
	res.write(Buffer.from(getWithHeader(`${commit.id} refs/heads/master`), 'utf8'))
	
	// end
	res.write(Buffer.from('0000', 'utf8'))
	res.end()
}

const getServiceRpc = async (_req, res, {blob, tree, commit}) => {

	res.setHeader('Content-Type', 'application/x-git-upload-pack-result')

	// header
	const pack = Buffer.from('PACK', 'utf8')
	const version = Buffer.from('00000002', 'hex')
	const count = Buffer.from('00000003', 'hex')
	const packHeader = Buffer.concat([pack, version, count])

	// body
	const commitHeader = Buffer.from(getObjectHeader(commit.data.byteLength, 'commit'), 'hex')
	const treeHeader = Buffer.from(getObjectHeader(tree.data.byteLength, 'tree'), 'hex')
	const blobHeader = Buffer.from(getObjectHeader(blob.data.byteLength, 'blob'), 'hex')
	const packBody = Buffer.concat([commitHeader, commit.zlib, treeHeader, tree.zlib, blobHeader, blob.zlib])
	
	// checksum
	const checksumSha = crypto.createHash('sha1').update(Buffer.concat([packHeader, packBody])).digest('hex')
	const checksum = Buffer.from(checksumSha, 'hex')
	
	// prefix
	res.write(Buffer.from(getWithHeader('NAK\x0a'), 'utf8'))
	
	// message
	const messageData = Buffer.concat([Buffer.from('\x01', 'utf8'), packHeader, packBody, checksum])
	const messageSize = Buffer.from((messageData.byteLength + 4).toString(16).padStart(4, '0'), 'utf8')
	res.write(Buffer.concat([messageSize, messageData]))

	// end
	res.write(Buffer.from('0000', 'utf8'))
	res.end()
}

const listen = async (req, res) => {

	console.log(req.url)

	const repo = await createRepository()

	const reqParsed = url.parse(req.url, true)
	if (reqParsed.pathname === '/info/refs') {
		await getInfoRefs(req, res, repo)
	} else if (reqParsed.pathname === '/git-upload-pack') {
		await getServiceRpc(req, res, repo)
	}
}

http.createServer(listen).listen(port, () => {
	console.log(`Git server started on http://localhost:${port} ...`)
})
