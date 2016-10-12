/**
 * Licensed under the Apache Licence 2.0
 *
 * Copyright 2016 Nicholas Ball at Incorpleo Ltd
 *
 * @author   Nicholas Ball (incorpleo.com)
 * @license  http://www.apache.org/licenses/LICENSE-2.0
 * @link     https://github.com/nicholasball/AkamaiNativeJSLib
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Akamai namespace
//var _akamai = _akamai || {};

// the class itself
var _akamai = Object.create(null, {
  config: {
    writable: true,
    value: {
      key: null,
      keyName: null,
      host: null,
      ssl: false,
      verbose: false
    }
  }
});

/**
 * Updates the config object
 *
 * @param {Object} conf
 * @returns {_akamai}
 */
_akamai.setConfig = function (conf) {
  this.config = this.deepmerge(this.config, conf);
  return this;
};

/**
 * Generates a random number
 *
 * @returns {String}
 */
_akamai.getUniqueId = function () {
  var str = '';
  for (var i = 0, r; i < 6; i++) {
    if ((i & 0x03) === 0) {
      r = Math.random() * 0x100000000;
    }
    str += r >>> ((i & 0x03) << 3) & 0xff;
  }
  return str; //+ process.pid; TODO: BROWSER UNIQUE?
};

/**
 * Returns the config object
 *
 * @returns {Object}
 */
_akamai.getConfig = function () {
  return this.config;
};

/**
 * Returns a set of headers for the authentication process
 *
 * @param {String} path
 * @param {Object} queryObj
 * @returns {Object}
 */
_akamai.getHeaders = function (path, queryObj) {
  var authData, authSign, query;

  query = querystring.stringify(this.deepmerge({version: 1, action: 'du', format: 'xml'}, queryObj || {}));

  authData = [
    5, '0.0.0.0', '0.0.0.0', parseInt(Date.now() / 1000, 10), this.getUniqueId(),
    this.getConfig().keyName
  ].join(', ');

  authSign = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA256, this.getConfig().key)
    .update([authData + path.replace(/\/$/, ''), 'x-akamai-acs-action:' + query, null].join("\n"))
    .finalize()
    .toString(CryptoJS.enc.Base64);

  return {
    'X-Akamai-ACS-Action': query,
    'X-Akamai-ACS-Auth-Data': authData,
    'X-Akamai-ACS-Auth-Sign': authSign
  };
};

/**
 * Adds http or https to the host
 *
 * @param {String} path
 * @returns {String}
 */
_akamai.getUri = function (path) {
  var host = ['http', this.getConfig().ssl ? 's' : '', '://', this.getConfig().host].join('');
  return [host, path.replace(/(^\/|\/$)/g, '')].join('/');
};

/**
 * Converts a xml string to an object
 *
 * @param {String} data
 * @param {Function} cb
 */
_akamai.getObjectFromXml = function (data, cb) {
  // Create x2js instance with default config
  var x2js = new X2JS();
  var jsonObj = x2js.xml_str2json(data);

  if (!jsonObj) {
    var errMsg = 'Unable to parse the response text';
    if (this.getConfig().verbose && data) {
      errMsg += '. Data: ' + data;
    }    
    return cb(new Error(errMsg));
  }

  cb(null, {result: jsonObj});
};

/**
 * Returns a request object for streaming TODO: Rename and change function
 *
 * @param {String} path
 * @param {Object} params
 * @param {Function} cb
 * @returns {request}
 */
_akamai.getRequestObject = function (path, params, cb) {
  var self = this,
    callback = function () {},
    options = this.deepmerge(
      {url: this.getUri(path), headers: this.getHeaders(path, params.headers)},
      params.request || {}
    );

  // Set the request method - PUT,POST,GET,HEAD,OPTIONS
  var request_method = options.method || "GET";

  var xmlhttp = this.createRequest(request_method, options.url);
  if (!xmlhttp) {
    var errMsg = 'Unable to create CORS request';
    return cb(new Error(errMsg));
  }

  // Set the generated request headers for Akamai auth
  for (var header in options.headers) {
    xmlhttp.setRequestHeader(header, options.headers[header]);
  }  

  if (typeof(cb) === 'function') {
    xmlhttp.onreadystatechange = function() {
      if (xmlhttp.readyState == XMLHttpRequest.DONE) {

        var body = xmlhttp.responseText;
        // wrong response code
        if (xmlhttp.status >= 300) {
          var errMsg = 'The server sent us the ' + xmlhttp.status + ' code';
          if (self.getConfig().verbose && body) {
            errMsg += '. Response: ' + body;
          }
          return cb(new Error(errMsg));
        }

        if (!body.match(/^<\?xml\s+/)) {
          return cb(null, {status: xmlhttp.status});
        }

        self.getObjectFromXml(body, cb);
      }
    }
  }

  xmlhttp.setRequestHeader("Accept", "text/xml");

  if (options.method == "put" && params.file) {

    // Make the call to Akamai with file data
    xmlhttp.send(params.file.data);

  } else {

    // Make the call to Akamai
    xmlhttp.send(params);

  }

};

/** Custom helpers **/

_akamai.fileExists = function (path, cb) {
  return this.stat(path, function (err, data) {
    if (err && err.message.indexOf('404 code') !== -1) {
      return cb(null, false);
    }
    if (data && data.stat && data.stat.file) {
      return cb(null, true);
    }
    return cb(err);
  });
};

_akamai.createRequest = function(method, url) {
  var xhr = new XMLHttpRequest();
  if ("withCredentials" in xhr) {
    // XHR for Chrome/Firefox/Opera/Safari.
    xhr.open(method, url, false);  // change to true for async
  } else if (typeof XDomainRequest != "undefined") {
    // XDomainRequest for IE.
    xhr = new XDomainRequest();
    xhr.open(method, url);
  } else {
    // CORS not supported.
    xhr = null;
  }
  return xhr;
};

_akamai.deepmerge = function(target, src) {
    var array = Array.isArray(src);
    var dst = array && [] || {};

    if (array) {
        target = target || [];
        dst = dst.concat(target);
        src.forEach(function(e, i) {
            if (typeof dst[i] === 'undefined') {
                dst[i] = e;
            } else if (typeof e === 'object') {
                dst[i] = deepmerge(target[i], e);
            } else {
                if (target.indexOf(e) === -1) {
                    dst.push(e);
                }
            }
        });
    } else {
        if (target && typeof target === 'object') {
            Object.keys(target).forEach(function (key) {
                dst[key] = target[key];
            })
        }
        Object.keys(src).forEach(function (key) {
            if (typeof src[key] !== 'object' || !src[key]) {
                dst[key] = src[key];
            }
            else {
                if (!target[key]) {
                    dst[key] = src[key];
                } else {
                    dst[key] = deepmerge(target[key], src[key]);
                }
            }
        });
    }

    return dst;
}

/** Api functions **/

// TODO: PIPES WONT WORK IN JS > CHANGE
/*_akamai.upload = function (stream, path, cb) {
  var options = {
    request: {method: 'put'},
    headers: {action: 'upload', 'upload-type': 'binary'}
  };
  stream.pipe(this.getRequestObject(path, options, cb));
  return this;
};*/

// TODO: PIPES WONT WORK IN JS > CHANGE
/*_akamai.download = function (path, stream, cb) {
  this.getRequestObject(path, {headers: {action: 'download'}}, cb).pipe(stream);
  return this;
};*/


_akamai.upload = function (content, path, cb) {
  var options = {
    request: {method: 'put'},
    headers: {action: 'upload', 'upload-type': 'binary'},
    file: {data: content}
  };
  this.getRequestObject(path, options, cb);
  return this;
};

_akamai.download = function (path, cb) {
  this.getRequestObject(path, {headers: {action: 'download'}}, cb);
  return this;
};

_akamai.stat = function (path, cb) {
  this.getRequestObject(path, {headers: {action: 'stat'}}, cb);
  return this;
};

_akamai.du = function (path, cb) {
  this.getRequestObject(path, {headers: {action: 'du'}}, cb);
  return this;
};

_akamai.dir = function (path, cb) {
  this.getRequestObject(path, {headers: {action: 'dir'}}, cb);
  return this;
};

_akamai.delete = function (path, cb) {
  this.getRequestObject(path, {request: {method: 'put'}, headers: {action: 'delete'}}, cb);
  return this;
};

_akamai.mkdir = function (path, cb) {
  this.getRequestObject(path, {request: {method: 'put'}, headers: {action: 'mkdir'}}, cb);
  return this;
};

_akamai.rmdir = function (path, cb) {
  this.getRequestObject(path, {request: {method: 'put'}, headers: {action: 'rmdir'}}, cb);
  return this;
};

_akamai.rename = function (pathFrom, pathTo, cb) {
  var options = {
    request: {method: 'put'},
    headers: {action: 'rename', destination: pathTo}
  };
  this.getRequestObject(pathFrom, options, cb);
  return this;
};

_akamai.symlink = function (pathFileTo, pathFileFrom, cb) {
  var options = {
    request: {method: 'put'},
    headers: {action: 'symlink', target: pathFileTo}
  };
  this.getRequestObject(pathFileFrom, options, cb);
  return this;
};

_akamai.mtime = function (path, date, cb) {
  if (!(date instanceof Date)) {
    return cb(new TypeError('The date has to be an instance of Date'));
  }

  var options = {
    request: {method: 'put'},
    headers: {action: 'mtime', mtime: parseInt(date.getTime() / 1000, 10)}
  };
  this.getRequestObject(path, options, cb);
  return this;
};
