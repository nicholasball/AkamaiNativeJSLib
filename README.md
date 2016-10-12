# AkamaiNativeJSLib

A Native JS library to access Akamai's CDN system using CORS requests.

#Required Libraries

* CryptoJS v3.1.2 - Custom rollup containing core.js + env-base64.js, sha256.js, hmac.js
* querystring v0.1.0 - Simple querystring lib with no dependencies
* xml2json
* jsmin.js (full) 2010-01-15

#Getting Started

1. Load up the required libraries
2. Load up AkamaiJSLib.js
3. Set up the Akamai config:

		_akamai.setConfig({
			keyName: 'NAME.A',
			key: 'KEY.B',
			host: 'HOST.C',
			ssl: true,
			verbose: true
		});


4. Use the commands laid out in AkamaiJSLib.js to manipulate you Akamai CDN directory