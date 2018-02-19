const PirateBay = require('thepiratebay');
const Stremio = require('stremio-addons');
const magnet = require('magnet-uri');
const imdb = require('imdb');

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

const addon = new Stremio.Server({
	'stream.find': function(args, callback) {
		createTitle(args)
			.then(title => {
				PirateBay.search(title, {
					orderBy: 'seeds',
					sortBy: 'desc'
				}).then(results => {
					return callback(null, results.slice(0, 4).map( episode => {
						const {infoHash, announce } = magnet.decode(episode.magnetLink);
						const availability = episode.seeders == 0 ? 0 : episode.seeders < 5 ? 1 : 2;
						const detail = `${episode.name} S:${episode.seeders}`;
						return {
							infoHash,
							name: 'PTB',
							title: detail,
							isFree: true,
							sources: [...announce.map(src => `tracker:${src}`), `dht:${infoHash}`],
							availability
						};
					}).filter(elem => elem.availability > 0));
				}).catch((err) => {
					console.error(err);
					return callback(new Error('internal'));
				});
			});
	},
	// 'meta.search': function(args, callback) {
	// 	const query = args.query;
	// 	return PirateBay.search(query, {
	// 		orderBy: 'seeds',
	// 		sortBy: 'desc'
	// 	}).then(results => {
	// 		const response = results.slice(0, 4).map( episode => {
	// 			const {infoHash, announce } = magnet.decode(episode.magnetLink);
	// 			const availability = episode.seeders == 0 ? 0 : episode.seeders < 5 ? 1 : 2;
	// 			const detail = `${episode.name} S:${episode.seeders}`;
	// 			return {
	// 				id: episode.id,                                       // unique ID for the media, will be returned as "basic_id" in the request object later
	// 				name: episode.name,                                          // title of media
	// 				poster: 'http://thetvdb.com/banners/posters/78804-52.jpg',    // image link
	// 				posterShape: 'regular',                                       // can also be 'landscape' or 'square'
	// 				banner: 'http://thetvdb.com/banners/graphical/78804-g44.jpg', // image link
	// 				genre: ['Entertainment'],
	// 				isFree: 1,                                                    // some aren't
	// 				popularity: 3831,                                             // the larger, the more popular this item is
	// 				popularities: { basic: 3831 },                                // same as 'popularity'; use this if you want to provide different sort orders in your manifest
	// 				type: 'movie',
	// 				stream: {
	// 					infoHash,
	// 					mapIdx: 0,
	// 					name: 'PTB',
	// 					title: detail,
	// 					isFree: true,
	// 					availability
	// 				}
	// 			};
	// 		});
	// 		return callback(null, {
	// 			query,
	// 			results: response
	// 		});
	// 	}).catch(err => {
	// 		console.log(err.message);
	// 		callback(err.message);
	// 	});
	// }
}, manifest);

/*  Construct title based on movie or series
 *  If series get title name by imdb_id and append season and episode
 *  @return String title
 */
const createTitle = args => new Promise((resolve, reject) => {
	let title = args.query.imdb_id;
	if (args.query.type === 'series') {
		imdb(args.query.imdb_id, function(err, data) {
			if(err) {
				return reject(new Error('internal'));
			}
			if(data){
				const movieTitle = (!data.originalTitle || data.originalTitle === 'N/A') ? data.title : data.originalTitle;

				let season = args.query.season;
				let episode = args.query.episode;

				if (parseInt(season) < 10) season = `0${season}`;
				if (parseInt(episode) < 10) episode = `0${episode}`;

				title = `${movieTitle} S${season}E${episode}`;
				return resolve(title);
			}
		});
	} else {
		return resolve(title);
	}
});

const server = require('http').createServer((req, res) => {
	addon.middleware(req, res, function() { res.end() }); // wire the middleware - also compatible with connect / express
})
	.on('listening', () => {
		console.log(`Piratebay Stremio Addon listening on ${server.address().port}`);
	})
	.listen(process.env.PORT || 7000);
