const Stremio = require('stremio-addons');
const magnet = require('magnet-uri');
const db = require('monk')(process.env.MONGO_URI);

const {
	initMongo,
	getTitle,
	search
} = require('./tools');

const localUrl = 'http://localhost:7000/stremioget/stremio/v1';
const productionUrl = 'https://piratebay-stremio-addon.herokuapp.com/stremio/v1';

const url = process.env.ENV === 'dev' ? localUrl : productionUrl;
const version = process.env.ENV === 'dev' ? '1.3.0.local' : '1.3.0';
const id = process.env.ENV === 'dev' ? 'org.stremio.piratebay.local' : 'org.stremio.piratebay';

const manifest = {
	'id': id,
	'version': version,
	'name': 'PirateBay Addon',
	'description': 'Fetch PirateBay entries on a single episode or series.',
	'icon': 'https://d2.alternativeto.net/dist/icons/thepiratebay_60782.png?width=128&height=128&mode=crop&upscale=false',
	'logo': 'https://d2.alternativeto.net/dist/icons/thepiratebay_60782.png?width=128&height=128&mode=crop&upscale=false',
	'isFree': true,
	'email': 'thanosdi@live.com',
	'endpoint': url,
	'types': [ 'movie', 'series' ],
	'background': 'http://wallpapercraze.com/images/wallpapers/thepiratebay-77708.jpeg',
	'idProperty': [ 'imdb_id' ],
	'filter': {
		'query.imdb_id': {'$exists': true},
		'query.type': {'$in': [ 'series', 'movie' ]}
	}
};

const addon = new Stremio.Server({
	'stream.find': async ( {query}, callback ) => {
		try {
			const title = await getTitle(query);
			const results = await search({...title, type: query.type});
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
	}); // wire the middleware - also compatible with connect / express
})
	.on('listening', async () => {
		await initMongo(db);
		console.log(`Piratebay Stremio Addon listening on ${server.address().port}`);
	})
	.listen(process.env.PORT || 7000);
