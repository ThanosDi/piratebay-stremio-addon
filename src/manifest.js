const localUrl = 'http://localhost:7000/stremioget/stremio/v1';
const productionUrl = 'https://piratebay-stremio-addon.herokuapp.com/stremio/v1';
const url = process.env.ENV === 'dev' ? localUrl : productionUrl;
const version = process.env.ENV === 'dev' ? '1.3.0.local' : '1.3.0';
const id = process.env.ENV === 'dev' ? 'org.stremio.piratebay.local' : 'org.stremio.piratebay';

module.exports = {
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