const PirateBay = require('thepiratebay');
const Stremio = require('stremio-addons');
const magnet = require('magnet-uri');
const imdb = require('imdb');
const torrentStream = require('torrent-stream');
const base64 = require('base-64');
const axios = require('axios');
const _ = require('lodash');

const manifest = {
	'id': 'org.stremio.piratebay',
	'version': '1.1.0',
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
	'id': 'org.stremio.piratebay-local',
	'version': '1.1.0',
	'name': 'PirateBay Addon-local',
	'description': 'Fetch PirateBay entries on a single episode or series.-local',
	'icon': 'https://files.gamebanana.com/img/ico/sprays/apirateslifeforme2007tpbpicrip.png',
	'logo': 'https://files.gamebanana.com/img/ico/sprays/apirateslifeforme2007tpbpicrip.png',
	'isFree': true,
	'email': 'thanosdi@live.com',
	'endpoint': 'http://localhost:7001/stremioget/stremio/v1',
	'types': ['movie', 'series', 'tv', 'channel'],
	'idProperty': ['ptb_id', 'imdb_id'], // the property to use as an ID for your add-on; your add-on will be preferred for items with that property; can be an array
	// We need this for pre-4.0 Stremio, it's the obsolete equivalent of types/idProperty
};

const client = new Stremio.Client();
client.add('http://cinemeta.strem.io/stremioget/stremio/v1');


// return axios.get(`https://dummyimage.com/600x400/000/fff&text=${episode.name}`)
// 	.then(({data}) => {
// 		const image = new Buffer(data).toString('base64');
// 		console.log(image);
//
// 	})
const addon = new Stremio.Server({
	'subtitles.find': function(args, callback, user) {
		console.log('subtitles.find', args);
		// expects an array of subtitle objects
	},
	'meta.find': function(args, callback,) {
		console.log('meta.find', args);
	},
	'meta.get': async function(args, callback, user) {
		const decodedData = base64.decode(args.query.ptb_id);
		const [magnetLink, query, seeders] = decodedData.split('|||');

		const parseVideo = require("video-name-parser");
		const parsedVideo = await parseVideo(query);
		const nameToImdb = require("name-to-imdb");

		return nameToImdb({ name: parsedVideo.name }, function(err, res, inf) {
			console.log(parsedVideo.name);
			console.log(res);
			client.meta.get({ query: { imdb_id: res } }, function(err, meta) {
				return new Promise(function(resolve, reject) {
					const engine = new torrentStream(magnetLink, {
						connections: 30
					});
					engine.ready(() => {
						resolve(engine);
					});
				})
					.then(engine => {
						const files = engine.files.map( (file, mapIdx) => {
							return {
								id: file.name,
								title: file.name,
								publishedAt: new Date().toISOString(),
								thumbnail: _.get(meta,'fanart.hdtvlogo[0].url')
								|| 'https://lh3.googleusercontent.com/-wTZicECGczgV7jZnLHtnCqVbCn1a3dVll7fp4uAaJOBuF47Lh97yTR_96odCvpzYCn9VsFUKA=w128-h128-e365',
								length: file.length,
								stream: {
									infoHash: engine.infoHash,
									mapIdx
								}
							}
						});
						const response = {
							id:`ptb_id:${args.query.ptb_id}`,
							ptb_id: args.query.ptb_id,
							name: `${query}, ${seeders}`,                                          // title of media
							poster:_.get(meta,'fanart.showbackground[0].url')|| '',    // image link
							posterShape: 'regular',                                       // can also be 'landscape' or 'square'
							banner: _.get(meta,'fanart.showbackground[0].url')|| '', // image link
							genre: meta.genre,
							isFree: 1,
							imdbRating: meta.imdbRating,
							popularity: 3831,                                             // the larger, the more popular this item is
							popularities: { basic: 3831 },
							type: 'channel',
							description: meta.description,
							videos: files
						};
						callback(null, response);
					});
			});

		});






	},
	'stream.find': function(args, callback) {
		console.log('stream.find', args);
		if (args.query.type === 'channel') {
			return callback(null, []);
		}
		createTitle(args)
			.then(title => {
				console.log('title', title);
				return ptbSearch(title, args.query.type)
					.then(results => {
						Promise.all(results)
							.then(results => {
								callback(null, results);

							})
					})
					.catch((err) => {
					console.log('err.message 22222', err.message);
						return callback(new Error('internal'));
					});
			});
	},
	'meta.search': function(args, callback) {
		const query = args.query;
		console.log(query);

		return PirateBay.search(query, {
			orderBy: 'seeds',
			sortBy: 'desc',
			category: 205
		}).then(({results}) => {
			const response = results.slice(0, 4).map( episode => {
				const id = `${episode.magnetLink}|||${episode.name}|||S:${episode.seeders}`;
				const encodedData = base64.encode(id);
				return {
					id:`ptb_id:${encodedData}`,                                       // unique ID for the media, will be returned as "basic_id" in the request object later
					ptb_id: `${encodedData}`,
					video_id: `${episode.name} , S:${episode.seeders}`,
					name: `${episode.name} , S:${episode.seeders}`,                                          // title of media
					poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/The_Pirate_Bay_logo.svg/2000px-The_Pirate_Bay_logo.svg.png',    // image link
					posterShape: 'regular',                                       // can also be 'landscape' or 'square'
					banner: 'http://thetvdb.com/banners/graphical/78804-g44.jpg', // image link
					genre: ['Entertainment'],
					isFree: 1,                                                    // some aren't
					popularity: 3831,                                             // the larger, the more popular this item is
					popularities: { basic: 3831 },
					type: 'channel'
				};

			});
			return callback(null, {
				query,
				complete: true,
				results: response
			});
		}).catch(err => {
			console.log(err.message);
			callback(err.message);
		});
	}
}, manifestLocal);


const ptbSearch = (query, type) => {
	console.log('type', type);
	return PirateBay.search(query, {
		orderBy: 'seeds',
		sortBy: 'desc',
		category: 205
	}).then(results => {
		return results.results.slice(0, 4).map( episode => {
			const {infoHash, announce } = magnet.decode(episode.magnetLink);
			// const availability = episode.seeders == 0 ? 0 : episode.seeders < 5 ? 1 : 2;
			const detail = `${episode.name} S:${episode.seeders}`;
			switch(type) {
				default:
					console.log('default');
					return {
						infoHash,
						name: 'PTB',
						title: detail,
						isFree: true,
						sources: [...announce.map(src => `tracker:${src}`), `dht:${infoHash}`],
						availability
					};
			}

		});
	}).catch((err) => {
		console.error('err.message', err.message);
		return new Error('internal');
	});
};
/*  Construct title based on movie or series
 *  If series get title name by imdb_id and append season and episode
 *  @return {String} title
 */
const createTitle = args => new Promise((resolve, reject) => {
	let title = args.query.imdb_id || args.query.id || args.query.ptb_id;
	switch (args.query.type) {
		case 'series':
			imdb(args.query.imdb_id, function (err, data) {
				if (err) {
					return reject(new Error('internal'));
				}
				if (data) {
					const movieTitle = (!data.originalTitle || data.originalTitle === 'N/A') ? data.title : data.originalTitle;

					let season = args.query.season;
					let episode = args.query.episode;

					if (parseInt(season) < 10) season = `0${season}`;
					if (parseInt(episode) < 10) episode = `0${episode}`;

					title = `${movieTitle} S${season}E${episode}`;
					return resolve(title);
				}
			});
			break;
		case 'movie':
			return resolve(title);
		case 'tv':
			console.log('tvvvvvvvvvvvvvvvv');
			return {

			}
			return resolve(title);
	}
});

const server = require('http').createServer((req, res) => {
	addon.middleware(req, res, function() { res.end() }); // wire the middleware - also compatible with connect / express
})
	.on('listening', () => {
		console.log(`Piratebay Stremio Addon listening on ${server.address().port}`);
	})
	.listen(process.env.PORT || 7001);
