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
			const results = await ptbSearch(query);
			const response = results
				.filter(torrent => torrent.seeders > 0)
				.slice(0, 7)
				.map(torrent => {
					const id = `${torrent.magnetLink}|||${torrent.name}|||S:${torrent.seeders}`;
					const encodedData = new Buffer(id).toString('base64');
					return {
						id:`ptb_id:${encodedData}`,
						ptb_id: `${encodedData}`,
						video_id: `${torrent.name.split('.').join(' ')} , S:${torrent.seeders}`,
						name: `${torrent.name.split('.').join(' ')} , S:${torrent.seeders}`,
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

		let meta = await getMetaDataByName(query);
		if (!meta) {
			const files = await filesStream(magnetLink);
			meta = await getMetaDataByName(files[0].title) || {};
		}
		meta.id = `ptb_id:${args.query.ptb_id}`;
		meta.ptb_id = args.query.ptb_id;
		meta.type = 'movie';
		meta.name = query;

		return callback(null, meta);
	},
	'stream.find': async (args, callback) => {
		/* Handle search results with ptb_id */
		if (args.query.ptb_id) {
			const decodedData = new Buffer(args.query.ptb_id, 'base64').toString('ascii');
			const [magnetLink, query, seeders] = decodedData.split('|||');

			const results = await filesStream(magnetLink, seeders);
			return callback(null, results);
		}
		/* Handle non ptb_id results*/
		const titleInfo = await createTitle(args);
		const promises = [ptbSearch(titleInfo.title, args.query.type)];
		if (args.query.type === 'series') {
			promises.push(ptbSearch(titleInfo.seriesTitle, args.query.type));
			promises.push(ptbSearch(titleInfo.episodeTitle, args.query.type));
		}
		Promise.all(
			promises
		).then(results => {
			let torrents = [];
			if (args.query.type === 'series') {
				torrents = []
					.concat(results[0]
						.filter(result => titleInfo.nameMatcher.test(result.name.toLowerCase().replace(/[^0-9a-z ]/gi, ' ')))
						.slice(0, 4))
					.concat(results[1]
						.filter(result => titleInfo.nameMatcher.test(result.name.toLowerCase().replace(/[^0-9a-z ]/gi, ' ')))
						.slice(0, 4))
					.concat(results[2].slice(0, 4));
			} else {
				torrents = results[0].slice(0, 4);
			}

			console.log('torrents:', torrents.map(torrent => torrent.name));

			const resolve = torrents
				.filter(torrent => torrent.seeders > 0)
				.sort((a, b) => b.seeders - a.seeders)
				.map(torrent => {
					const { infoHash, announce } = magnet.decode(torrent.magnetLink);
					const availability = torrent.seeders == 0 ? 0 : torrent.seeders < 5 ? 1 : 2;
					const detail = `${torrent.name.replace(/,/g, ' ')}\n👤 ${torrent.seeders}`;

					return {
						infoHash,
						name: 'PTB',
						title: detail,
						availability
					};
				}).filter(torrent => torrent.infoHash);
			return callback(null, resolve);
		}).catch((error) => {
	    	console.error(error);
	   	 	return callback(new Error('ptbsearch error:', error.message));
	  	});

	},
}, manifest);

/*
 * Reads torrent and maps all video files to Stream object
 */
const filesStream = async (magnetLink, seeders = 5) => {
	try {
		const availability = seeders == 0 ? 0 : seeders < 5 ? 1 : 2;
		const { files, infoHash } = await torrentStreamEngine(magnetLink);

		return files
			.map((file, fileIdx) => {
				return {
					infoHash,
					fileIdx,
					name: 'PTB',
					availability,
					title: file.name
				}
			})
			.filter(file => videoExtensions.indexOf(file.title.split('.').pop()) !== -1);
	} catch (e) {
		return new Error(e.message);
	}
}

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
				seriesTitle = seriesTitle.toLowerCase().replace(/[^0-9a-z ]/gi, ' '); // to lowercase and remove all non-alphanumeric chars

				const seasonNum = parseInt(args.query.season);
				const episodeNum = parseInt(args.query.episode);

				const season = seasonNum < 10 ? `0${seasonNum}` : `${seasonNum}`;
				const episode = episodeNum < 10 ? `0${episodeNum}` : `${episodeNum}`;

				return {
					title: title,
					seriesTitle: seriesTitle,
					episodeTitle:`${seriesTitle} s${season}e${episode}`,
					nameMatcher: new RegExp(
						`\\b${seriesTitle}\\b.*` + // match series title folowed by any characters
							`(` + // start capturing second condition
								// first variation
								`\\bseasons?\\b[^a-zA-Z]*` + // contains 'season'/'seasons' followed by non-alphabetic characters
									`(` + // start capturing sub condition
										`\\bs?0?${seasonNum}\\b` + // followed by season number ex:'4'/'04'/'s04'/'1,2,3,4'/'1 2 3 4'
										`|\\b[01]?\\d\\b[^a-zA-Z]*-[^a-zA-Z]*\\b[01]?\\d\\b` + // or followed by season range '1-4'/'01-04'/'1-12'
									`)` + // finish capturing subcondition
								// second variation
								`|\\bs${season}\\b` + // or constains only season indentifier 's04'/'s12'
								// third variation
								`|\\bs[01]?\\d\\b[^a-zA-Z]*-[^a-zA-Z]*\\bs[01]?\\d\\b` + // or contains season range 's01 - s04'/'s01.-.s04'/'s1-s12'
								// fourth variation
								`|((\\bcomplete|all|full\\b).*(\\bseries|seasons\\b))` + // or contains any two word variation from (complete,all,full)+(series,seasons)
							`)` // finish capturing second condition
					, 'i') // case insensitive matcher
				};
			} catch (e) {
				return new Error(e.message);
			}
		case 'movie':
			return {
				title: title
			}
	}
};

const server = require('http').createServer((req, res) => {
	addon.middleware(req, res, function() { res.end() }); // wire the middleware - also compatible with connect / express
})
	.on('listening', () => {
		console.log(`Piratebay Stremio Addon listening on ${server.address().port}`);
	})
	.listen(process.env.PORT || 7000);
