const Stremio = require('stremio-addons');
const magnet = require('magnet-uri');
const db = require('monk')(process.env.MONGO_URI);
const {
	imdbIdToName,
	torrentStreamEngine,
	getMetaDataByName,
	ptbSearch,
	initMongo
} = require('./tools');

const manifest = {
	'id': 'org.stremio.piratebay',
	'version': '1.3.0',
	'name': 'PirateBay Addon',
	'description': 'Fetch PirateBay entries on a single episode or series.',
	'icon': 'https://static.wareziens.net/wp-content/image.php?url=http://www.turbopix.fr/up/1326291999.png',
	'logo': 'https://static.wareziens.net/wp-content/image.php?url=http://www.turbopix.fr/up/1326291999.png',
	'isFree': true,
	'email': 'thanosdi@live.com',
	'endpoint': 'https://piratebay-stremio-addon.herokuapp.com/stremio/v1',
	'types': ['movie', 'series'],
	'background':'http://wallpapercraze.com/images/wallpapers/thepiratebay-77708.jpeg',
	'idProperty': ['ptb_id', 'imdb_id'], // the property to use as an ID for your add-on; your add-on will be preferred for items with that property; can be an array
	// We need this for pre-4.0 Stremio, it's the obsolete equivalent of types/idProperty
	'filter': { 'query.imdb_id': { '$exists': true }, 'query.type': { '$in':['series','movie'] } }
};

const manifestLocal = {
	'id': 'org.stremio.piratebay.local',
	'version': '1.3.0',
	'name': 'PirateBay Addon local',
	'description': 'Fetch PirateBay entries on a single episode or series. local',
	'icon': 'https://static.wareziens.net/wp-content/image.php?url=http://www.turbopix.fr/up/1326291999.png',
	'logo': 'https://static.wareziens.net/wp-content/image.php?url=http://www.turbopix.fr/up/1326291999.png',
	'isFree': true,
	'email': 'thanosdi@live.com',
	'endpoint': 'http://localhost:7000/stremioget/stremio/v1',
	'types': ['movie', 'series'],
	'background':'http://wallpapercraze.com/images/wallpapers/thepiratebay-77708.jpeg',
	'idProperty': ['ptb_id', 'imdb_id'], // the property to use as an ID for your add-on; your add-on will be preferred for items with that property; can be an array
	// We need this for pre-4.0 Stremio, it's the obsolete equivalent of types/idProperty
	'filter': { 'query.imdb_id': { '$exists': true }, 'query.type': { '$in':['series','movie'] } }
};

const addon = new Stremio.Server({
	'stream.find': async (args, callback) => {
		/* Handle non ptb_id results*/
		const title = await createTitle(args);
		try {
			const results = await ptbSearch(title);
			const resolve = results.map( episode => {
				const {infoHash, announce } = magnet.decode(episode.magnetLink);
				const availability = episode.seeders == 0 ? 0 : episode.seeders < 5 ? 1 : 2;
				const detail = `${episode.name}\n👤 ${episode.seeders}`;
				return {
					infoHash,
					name: 'PTB',
					title: detail,
					availability
				};
			});
			return callback(null, resolve);
		} catch (e) {}
	},
}, manifest);

/*  Construct title based on movie or series
 *  If series get title name by imdb_id and append season and episode
 *  @return {String} title
 */
const createTitle = async args => {
	let title = args.query.imdb_id || args.query.id;
	switch (args.query.type) {
		case 'series':
			try {
				const data = await imdbIdToName(args.query.imdb_id);
				const movieTitle = (!data.originalTitle || data.originalTitle === 'N/A') ? data.title : data.originalTitle;

				let season = args.query.season;
				let episode = args.query.episode;

				if (parseInt(season) < 10) season = `0${season}`;
				if (parseInt(episode) < 10) episode = `0${episode}`;

				title = `${movieTitle} S${season}E${episode}`;
				return title;
			} catch (e) {
				return new Error(e.message);
			}
		case 'movie':
			return title;
	}
};

const server = require('http').createServer((req, res) => {
	addon.middleware(req, res, async function() {
		return res.end()
	}); // wire the middleware - also compatible with connect / express
})
	.on('listening', async () => {
		await initMongo(db);
		console.log(`Piratebay Stremio Addon listening on ${server.address().port}`);
	})
	.listen(process.env.PORT || 7000);
