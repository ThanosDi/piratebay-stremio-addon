const Stremio = require('stremio-addons');
const magnet = require('magnet-uri');
const videoExtensions = require('video-extensions');
const {
	imdbIdToName,
	torrentStreamEngine,
	getMetaDataByName,
	ptbSearch
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
	'meta.search': async (args, callback) => {
		const query = args.query;
		try {
			const {results} = await ptbSearch(query);
			const response = results.slice(0, 4).map( episode => {
				const id = `${episode.magnetLink}|||${episode.name}|||S:${episode.seeders}`;
				const encodedData = new Buffer(id).toString('base64');
				return {
					id:`ptb_id:${encodedData}`,
					ptb_id: `${encodedData}`,
					video_id: `${episode.name.split('.').join(' ')} , S:${episode.seeders}`,
					name: `${episode.name.split('.').join(' ')} , S:${episode.seeders}`,
					poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/The_Pirate_Bay_logo.svg/2000px-The_Pirate_Bay_logo.svg.png',
					posterShape: 'regular',
					isFree: true,
					type: 'movie'
				};
			});
			return callback(null, {
				query,
				results: response
			});
		} catch (e) {
			console.log('e.message', e.message);
		}
	},
	'meta.get': async function(args, callback, user) {
		const decodedData = new Buffer(args.query.ptb_id, 'base64').toString('ascii');
		const [magnetLink, query, seeders] = decodedData.split('|||');

		const meta = await getMetaDataByName(query);
		const response = {
			id:`ptb_id:${args.query.ptb_id}`,
			ptb_id: args.query.ptb_id,
			name: `${meta.name || query.split('.').join(' ')} `,
			poster: meta.poster,
			posterShape: 'regular',
			banner: meta.banner,
			genre: meta.genre,
			isFree: 1,
			imdbRating: meta.imdbRating,
			type: 'movie',
			year:meta.year,
			description: meta.description,
		};

		callback(null, response);
	},
	'stream.find': async (args, callback) => {
		/* Handle search results with ptb_id */
		if (args.query.type === 'movie' && args.query.ptb_id) {
			const decodedData = new Buffer(args.query.ptb_id, 'base64').toString('ascii');

			const [magnetLink, query, seeders] = decodedData.split('|||');

			const {files, infoHash} = await torrentStreamEngine(magnetLink);
			const availability = seeders == 0 ? 0 : seeders < 5 ? 1 : 2;
			const results = files
				.map((file, fileIdx) => {
					return {
						infoHash,
						fileIdx,
						name: 'PTB',
						availability,
						title: file.name
					}
				})
				.filter(file => videoExtensions.indexOf(file.title.split('.').pop()) !== -1)
				.map(file => {
					file.title = file.title.split('.').join(' ');
					return file;
				});
			return callback(null, results);
		}
		/* Handle non ptb_id results*/
		const titleInfo = await createTitle(args);
		try {
			Promise.all([
				ptbSearch(titleInfo.episodeTitle, args.query.type),
				ptbSearch(titleInfo.seriesTitle, args.query.type)
			]).then(values => {
				const results = []
					.concat(values[0].results.slice(0, 4))
					.concat(values[1].results
						.filter(result => titleInfo.keywords.some(parts => parts.every(part => result.name.toLowerCase().includes(part)))));

				console.log('torrents:', results.map(result => result.name));

				const resolve = results
					.sort((a, b) => b.seeders - a.seeders)
					.map(result => {
						const { infoHash, announce } = magnet.decode(result.magnetLink);
						const availability = result.seeders == 0 ? 0 : result.seeders < 5 ? 1 : 2;
						const detail = `${result.name}\n👤 ${result.seeders}`;
						return {
							infoHash,
							name: 'PTB',
							title: detail,
							availability
						};
					});
				return callback(null, resolve);
			});
		} catch (e) {
			console.log('ptbsearch error:', e.message);
		}
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
				let seriesTitle = (!data.originalTitle || data.originalTitle === 'N/A') ? data.title : data.originalTitle;
				seriesTitle = seriesTitle.toLowerCase();

				const seasonNum = parseInt(args.query.season);
				const episodeNum = parseInt(args.query.episode);

				const season = seasonNum < 10 ? `0${seasonNum}` : `${seasonNum}`;
				const episode = episodeNum < 10 ? `0${episodeNum}` : `${episodeNum}`;

				return {
					seriesTitle: seriesTitle,
					season: season,
					episode: episode,
					episodeTitle:`${seriesTitle} s${season}e${episode}`,
					keywords: [
						[seriesTitle, `s${season} `],
						[seriesTitle, `season`, ` ${seasonNum} `],
						[seriesTitle, `complete`, `series`],
						[seriesTitle, `seasons`]
					]
				};
			} catch (e) {
				return new Error(e.message);
			}
		case 'movie':
			return title;
	}
};

const server = require('http').createServer((req, res) => {
	addon.middleware(req, res, function() { res.end() }); // wire the middleware - also compatible with connect / express
})
	.on('listening', () => {
		console.log(`Piratebay Stremio Addon listening on ${server.address().port}`);
	})
	.listen(process.env.PORT || 7000);
