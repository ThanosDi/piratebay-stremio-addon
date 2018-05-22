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
	'icon': 'https://files.gamebanana.com/img/ico/sprays/apirateslifeforme2007tpbpicrip.png',
	'logo': 'https://files.gamebanana.com/img/ico/sprays/apirateslifeforme2007tpbpicrip.png',
	'isFree': true,
	'email': 'thanosdi@live.com',
	'endpoint': 'https://piratebay-stremio-addon.herokuapp.com/stremio/v1',
	'types': ['movie', 'series'],
	'idProperty': 'imdb_id', // the property to use as an ID for your add-on; your add-on will be preferred for items with that property; can be an array
	// We need this for pre-4.0 Stremio, it's the obsolete equivalent of types/idProperty
	'filter': { 'query.imdb_id': { '$exists': true }, 'query.type': { '$in':['series','movie'] } }
};

const manifestLocal = {
	'id': 'org.stremio.piratebay',
	'version': '1.3.0',
	'name': 'PirateBay Addon',
	'description': 'Fetch PirateBay entries on a single episode or series.',
	'icon': 'https://files.gamebanana.com/img/ico/sprays/apirateslifeforme2007tpbpicrip.png',
	'logo': 'https://files.gamebanana.com/img/ico/sprays/apirateslifeforme2007tpbpicrip.png',
	'isFree': true,
	'email': 'thanosdi@live.com',
	'endpoint': 'http://localhost:7000/stremioget/stremio/v1',
	'types': ['movie', 'series'],
	'idProperty': 'imdb_id', // the property to use as an ID for your add-on; your add-on will be preferred for items with that property; can be an array
	// We need this for pre-4.0 Stremio, it's the obsolete equivalent of types/idProperty
	'filter': { 'query.imdb_id': { '$exists': true }, 'query.type': { '$in':['series','movie'] } }
};

const addon = new Stremio.Server({
	'meta.search': async (args, callback) => {
		console.log('meta.search args', args);
		const query = args.query;
		try {
			const {results} = await ptbSearch(query);
			const response = results.slice(0, 4).map( episode => {
				const id = `${episode.magnetLink}|||${episode.name}|||S:${episode.seeders}`;
				const encodedData = new Buffer(id).toString('base64');
				console.log('encodedData', encodedData);
				return {
					id:`ptb_id:${encodedData}`,
					ptb_id: `${encodedData}`,
					video_id: `${episode.name.split('.').join(' ')} , S:${episode.seeders}`,
					name: `${episode.name.split('.').join(' ')} , S:${episode.seeders}`,
					poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/The_Pirate_Bay_logo.svg/2000px-The_Pirate_Bay_logo.svg.png',
					posterShape: 'regular',
					banner: 'http://thetvdb.com/banners/graphical/78804-g44.jpg',
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

		console.log(decodedData);
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
		console.log('meta.get', response);

		callback(null, response);

	},
	'stream.find': async (args, callback) => {
		console.log('args', args);
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
			// console.log(`stream.find: ${args.query.ptb_id}`, results);
			return callback(null, results);
		}
		/* Handle non ptb_id results*/
		const title = await createTitle(args);
		try {
			const {results} = await ptbSearch(title, args.query.type);
			const resolve = results.slice(0, 4).map( episode => {
				const {infoHash, announce } = magnet.decode(episode.magnetLink);
				const availability = episode.seeders == 0 ? 0 : episode.seeders < 5 ? 1 : 2;
				const detail = `${episode.name}
👤 ${episode.seeders}`;
				return {
					infoHash,
					name: 'PTB',
					title: detail,
					availability
				};
			});
			return callback(null, resolve);
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
	addon.middleware(req, res, function() { res.end() }); // wire the middleware - also compatible with connect / express
})
	.on('listening', () => {
		console.log(`Piratebay Stremio Addon listening on ${server.address().port}`);
	})
	.listen(process.env.PORT || 7000);
