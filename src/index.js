const Stremio = require('stremio-addons');
const magnet = require('magnet-uri');
const db = require('monk')(process.env.MONGO_URI);

const manifest = require('./manifest');
const {
	initMongo,
	getTitle,
	search
} = require('./tools');

const addon = new Stremio.Server({
	'stream.find': async ( {query}, callback ) => {
		try {
			const title = await getTitle(query);
			const results = await search({...title, type: query.type}) || [];
			const resolve = results.map(file => {
				const {infoHash} = magnet.decode(file.magnetLink);
				const detail = `${file.name}\n💾 ${file.size}\n👤 ${file.seeders}`;
				return {infoHash, name: 'PTB', title: detail, availability: 1};
			});
			return callback(null, resolve);
		} catch (e) {
			console.log(e)
		}
	},
}, manifest);


const server = require('http').createServer(( req, res ) => {
	addon.middleware(req, res, async function () {
		return res.end()
	});
}).on('listening', async () => {
		await initMongo(db);
		console.log(`Piratebay Stremio Addon listening on ${server.address().port}`);
	})
	.listen(process.env.PORT || 7000);
