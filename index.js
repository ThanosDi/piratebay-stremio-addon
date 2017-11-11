const PirateBay = require('thepiratebay');
const Stremio = require('stremio-addons');
const magnet = require('magnet-uri');
const imdb = require('imdb');

const manifest = {
	// See https://github.com/Stremio/stremio-addons/blob/master/docs/api/manifest.md for full explanation
	'id': 'org.stremio.piratebay',
	'version': '1.0.0',
	'name': 'PirateBay Addon',
	'description': 'Fetch PirateBay entries on a single episode.',
	'icon': 'https://files.gamebanana.com/img/ico/sprays/apirateslifeforme2007tpbpicrip.png',
	'logo': 'https://files.gamebanana.com/img/ico/sprays/apirateslifeforme2007tpbpicrip.png',
	'isFree': true,
	'email': 'thanosdi@live.com',
	'endpoint': 'https://piratebay-stremio-addon.herokuapp.com/',
	// Properties that determine when Stremio picks this add-on
	'types': ['movie', 'series'], // your add-on will be preferred for those content types
	'idProperty': 'imdb_id', // the property to use as an ID for your add-on; your add-on will be preferred for items with that property; can be an array
	// We need this for pre-4.0 Stremio, it's the obsolete equivalent of types/idProperty
	'filter': { 'query.imdb_id': { '$exists': true }, 'query.type': { '$in':['series','movie'] } }
};

const addon = new Stremio.Server({
	'stream.find': function(args, callback) {
		imdb(args.query.imdb_id, function(err, data) {
			if(err) {
				console.error(err.stack);
			}
			if(data){
				const imdbTitle = (!data.originalTitle || data.originalTitle === 'N/A') ? data.title : data.originalTitle;
				const title = createTitle(imdbTitle, args);
				PirateBay.search(title, {
					orderBy: 'seeds',
					sortBy: 'desc'
				}).then((results) => {
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
			}
		});
	}
}, manifest);

const createTitle = (movieTitle, args) => {
	let title = movieTitle;
	if (args.query.type === 'series') {
		let season = args.query.season;
		let episode = args.query.episode;

		if (parseInt(season) < 10){
			season = `0${season}`;
		}
		if (parseInt(episode) < 10){
			episode = `0${episode}`;
		}

		title = `${movieTitle} S${season}E${episode}`;
	}

	return title;
};

const server = require('http').createServer((req, res) => {
	addon.middleware(req, res, function() { res.end() }); // wire the middleware - also compatible with connect / express
})
	.on('listening', () => {
		console.log(`Piratebay Stremio Addon listening on ${server.address().port}`);
	})
	.listen(process.env.PORT || 7000);