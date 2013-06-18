﻿///<reference path='dts\node.d.ts' />
///<reference path='dts\express.d.ts' />
///<reference path='dts\general.d.ts' />
///<reference path='core.ts' />

/* Copyright 2013 Auersoft */

require('./core');
(module).exports = VV;

var HTTP = require('http');
var jwt = require('./jwtSupport');
var requestSigning = require('./requestSigning');
var jsyaml = require('js-yaml');
var nodeJsRequest = require('request');
var Q = require('q');

/**
 * constructor for the vvClient object
 * first parameter may be an object with the following properties:
 * 'CustomerAlias, DatabaseAlias, Key, UserId, baseUrl'
 * or each these properties may be passed as individual properies to the constructor
 * @param {String} custAlias     The Customer alias to be used in each request.
 * @param {String} custDbAlias     The Database alias to be used in each request.
 * @param {String} apiKey     The API key to the account to service account.
 * @param {String} developerId     The developer ID for the developer account you want to use.
 * @param {String} developerSecret     The developer secret for the developer account you want to use.
 * @param {String} baseUrl     The Url to the VisualVault server to make REST api calls to.
 */
class VVRestApi {
    _config: any;
    _isAuthenticated: bool;
    _token: string;
    _isDebugMode: bool;
    _developerSecret: string;
    _developerId: string;
    _apiKey: string;
    _custAlias: string;
    _custDbAlias: string;
    _baseUrl: string;
    _apiUrl: string;
    _authenticationUrl: string;

    constructor(custAlias, custDbAlias, apiKey, developerId, developerSecret, baseUrl, isDebugMode) {
        this._config = require('./config.yml');

        this._isAuthenticated = false;
        this._token = null;

        this._isDebugMode = false;
        this._developerSecret = "";
        this._developerId = "";
        this._apiKey = "";

        this._custAlias = "";
        this._custDbAlias = "";

        this._baseUrl = "";
        this._apiUrl = "";
        this._authenticationUrl = "";

        //Base URL should not end with a trailing slash
        if (this.endsWith(baseUrl, '/')) {
            baseUrl = baseUrl.substring(0, baseUrl.length - 1);
        }

        if (typeof custAlias === 'string') {
            this._custAlias = custAlias;
            this._custDbAlias = custDbAlias;
            this._developerSecret = developerSecret;
            this._developerId = developerId;
            this._apiKey = apiKey;
            this._baseUrl = baseUrl;
        } else if (typeof custAlias === 'object') {
            var params = custAlias;

            this._custAlias = params.CustomerAlias;
            this._custDbAlias = params.DatabaseAlias;
            this._developerSecret = params.DeveloperSecret;
            this._developerId = params.DeveloperId;
            this._apiKey = params.ApiKey;
            this._baseUrl = params.baseUrl;
        }

        this._apiUrl = this._config.ApiUri.replace('{custalias}', this._custAlias).replace('{custdbalias}', this._custDbAlias);
        this._authenticationUrl = this._config.AutheticateUri.replace('{custalias}', this._custAlias).replace('{custdbalias}', this._custDbAlias);

        if (this._developerSecret === null || this._developerSecret === '') {
            this._developerSecret = this._config.DeveloperSecret;
        }

        if (this._developerId === null || this._developerId === '') {
            this._developerId = this._config.DeveloperId;
        }

        if (this._apiKey === null || this._apiKey === '') {
            this._apiKey = this._config.ApiKey;
        }

        this._isDebugMode = isDebugMode;

        if (this._isDebugMode) {
            console.log("Authentication Url: " + this._authenticationUrl);
            console.log("Base Url: " + this._baseUrl);
        }
    }

    endsWith(source, suffix) {
        return source.indexOf(suffix, source.length - suffix.length) !== -1;
    }

    acquireSecurityToken() {
        var self = this;

        var deferred = Q.defer();

        Q.when( this.__getToken() )
            .then(function (response) {
                console.log('acquireSecurityToken Success');
                deferred.resolve(response);
            })
            .fail(function (error) {
                console.log('acquireSecurityToken Failed');
                deferred.reject(new Error(error));
            });

        return deferred.promise;
    }
    
    //get the FormTemplates
    getFormTemplates(params) {
        var url = this.__getUrl(this._config.ResourceUri.FormTemplates);

        var opts = { method: 'GET' };

        return this.__doVvClientRequest(url, opts, params, null);
    }

    //get list of form data instances
    getForms(params, formTemplateId) {
        var resourceUri = this._config.ResourceUri.Forms.replace('{id}', formTemplateId);
        var url = this.__getUrl(resourceUri);

        var opts = { method: 'GET' };

        return this.__doVvClientRequest(url, opts, params, null);
    }

    //create new form data instance
    postForms(params, data, formTemplateId) {
        var resourceUri = this._config.ResourceUri.Forms.replace('{id}', formTemplateId);
        var url = this.__getUrl(resourceUri);

        var opts = { method: 'POST' };

        return this.__doVvClientRequest(url, opts, params, data);
    }

    //create a new revision existing form data instance
    postFormRevision(params, data, formTemplateId, formId) {
        var resourceUri = this._config.ResourceUri.Forms.replace('{id}', formTemplateId);
        var url = this.__getUrl(resourceUri + '/' + formId);

        var opts = { method: 'POST' };

        return this.__doVvClientRequest(url, opts, params, data);
    }

    //get the Sites
    getSites(params) {
        var url = this.__getUrl(this._config.ResourceUri.Sites);

        var opts = { method: 'GET' };

        return this.__doVvClientRequest(url, opts, params, null);
    }

    //create new Site
    postSites(params, data) {
        var resourceUri = this._config.ResourceUri.Sites;
        var url = this.__getUrl(resourceUri);

        var opts = { method: 'POST' };

        return this.__doVvClientRequest(url, opts, params, data);
    }

    //update existing Site
    putSites(params, data, siteId) {
        var resourceUri = this._config.ResourceUri.Sites;
        var url = this.__getUrl(resourceUri + '/' + siteId);

        var opts = { method: 'PUT' };

        return this.__doVvClientRequest(url, opts, params, data);
    }

    //get list of users
    getUsers(params, siteId) {
        var resourceUri = this._config.ResourceUri.Users.replace('{id}', siteId);
        var url = this.__getUrl(resourceUri);

        var opts = { method: 'GET' };

        return this.__doVvClientRequest(url, opts, params, null);
    }

    //create new User
    postUsers(params, data, siteId) {
        var resourceUri = this._config.ResourceUri.Users.replace('{id}', siteId);
        var url = this.__getUrl(resourceUri);

        var opts = { method: 'POST' };

        return this.__doVvClientRequest(url, opts, params, data);
    }

    //update existing User
    putUsers(params, data, siteId, usId) {
        var resourceUri = this._config.ResourceUri.Users.replace('{id}', siteId);
        var url = this.__getUrl(resourceUri + '/' + usId);

        var opts = { method: 'PUT' };

        return this.__doVvClientRequest(url, opts, params, data);
    }

    //get list of groups
    getGroups(params, siteId) {
        var resourceUri = this._config.ResourceUri.Groups.replace('{id}', siteId);
        var url = this.__getUrl(resourceUri);

        var opts = { method: 'GET' };

        return this.__doVvClientRequest(url, opts, params, null);
    }

    //create new Group
    postGroups(params, data, siteId) {
        var resourceUri = this._config.ResourceUri.Groups.replace('{id}', siteId);
        var url = this.__getUrl(resourceUri);

        var opts = { method: 'POST' };

        return this.__doVvClientRequest(url, opts, params, data);
    }

    //update existing Group
    putGroups(params, data, siteId, grId) {
        var resourceUri = this._config.ResourceUri.Groups.replace('{id}', siteId);
        var url = this.__getUrl(resourceUri + '/' + grId);

        var opts = { method: 'PUT' };

        return this.__doVvClientRequest(url, opts, params, data);
    }

    //get the Folders
    getFolders(params) {
        var url = this.__getUrl(this._config.ResourceUri.Folders);

        var opts = { method: 'GET' };

        return this.__doVvClientRequest(url, opts, params, null);
    }

    //get list of documents
    getDocuments(params, folderId) {
        var resourceUri = this._config.ResourceUri.Documents.replace('{id}', folderId);
        var url = this.__getUrl(resourceUri);

        var opts = { method: 'GET' };

        return this.__doVvClientRequest(url, opts, params, null);
    }

    //create new Email
    postEmails(params, data) {
        var url = this.__getUrl(this._config.ResourceUri.Emails);

        var opts = { method: 'POST' };

        return this.__doVvClientRequest(url, opts, params, data);
    }

    getSecurityToken() {
        return this._token;
    }

    isAuthenticated() {
        return this._isAuthenticated;
    }

    getBaseUrl() {
        return this._baseUrl;
    }

    request(httpVerb, url, params, data) {
        var opts = { method: '' };

        if (httpVerb.toLowerCase() === 'post') {
            opts.method = 'POST';
        } else if (httpVerb.toLowerCase() === 'put') {
            opts.method = 'PUT';
        } else if (httpVerb.toLowerCase() === 'delete') {
            opts.method = 'DELETE';
        } else {
            opts.method = 'GET';
        }

        return this.__doVvClientRequest(url, opts, params, data);
    }
    
    httpGet(url, params, requestCallback) {
        var self = this;

        //create the options object for the call 

        //THIS IS WHERE WE NEED TO ADD THE HEADERS REQUIRED BY REST API
        // Signature, X-VVA-RequestDate, X-VV-ContentMD5
        var options = { method: 'GET', uri: url, qs: params };

        //if security token hasn't been acquired then get it
        if (this._token == null) {
            //send request for security token
            this.__acquireNewTokenWithRequest(options, requestCallback);
        } else {
            //add security token to parameters that make up the query string
            params.token = this._token;


            console.log("Performing GET request to url:" + url);

            //make call
            nodeJsRequest(options, function (error, response, body) {
                requestCallback(error, response, body);
            });
        }
    }

    httpPost(url, params, data, requestCallback) {
        var self = this;

        //create the options object for the call
        //THIS IS WHERE WE NEED TO ADD THE HEADERS REQUIRED BY REST API
        // X-Authorization, X-VV-RequestDate, X-VV-ContentMD5
        var options = { method: 'POST', uri: url, qs: params, json: data };

        //if security token hasn't been acquired then get it
        if (this._token == null) {
            //send request for security token
            this.__acquireNewTokenWithRequest(options, requestCallback);
        } else {
            //add security token to parameters that make up the query string
            params.token = this._token;

            console.log("Performing POST request to url:" + url);

            //make call
            nodeJsRequest(options, function (error, response, body) {
                requestCallback(error, response, body);
            });
        }
    }

    httpPut(url, params, data, requestCallback) {
        var self = this;

        //create the options object for the call
        //THIS IS WHERE WE NEED TO ADD THE HEADERS REQUIRED BY REST API
        // X-Authorization, X-VV-RequestDate, X-VV-ContentMD5
        var options = { method: 'PUT', uri: url, qs: params, json: data };

        //if security token hasn't been acquired then get it
        if (this._token == null) {
            //send request for security token
            this.__acquireNewTokenWithRequest(options, requestCallback);
        } else {
            //add security token to parameters that make up the query string
            params.token = this._token;

            console.log("Performing PUT request to url:" + url);

            //make call
            nodeJsRequest(options, function (error, response, body) {
                requestCallback(error, response, body);
            });
        }
    }

    httpDelete(url, params, requestCallback) {
        var self = this;

        //create the options object for the call
        //THIS IS WHERE WE NEED TO ADD THE HEADERS REQUIRED BY REST API
        // X-Authorization, X-VV-RequestDate, X-VV-ContentMD5
        var options = { method: 'DELETE', uri: url, qs: params };


        //if security token hasn't been acquired then get it
        if (this._token == null) {
            //send request for security token
            this.__acquireNewTokenWithRequest(options, requestCallback);
        } else {
            //add security token to parameters that make up the query string
            params.token = this._token;

            console.log("Performing DELETE request to url:" + url);

            //make call
            nodeJsRequest(options, function (error, response, body) {
                requestCallback(error, response, body);
            });
        }
    }
    
    __acquireNewTokenWithRequest(options, requestCallback) {
        var attemptCount = 0;

        //making call to getToken to get access token
        Q
            .when(
                this.__getToken()
            )
            .then(
            function () {
                options.qs.token = this._token;

                //make call
                nodeJsRequest(options, function (error, response, body) {
                    requestCallback(error, response, body);
                });
            }
        )
            .fail(
            function (tokenError) {
                attemptCount++;
                this.__recursiveAttemptAcquireToken(options, requestCallback, attemptCount);
            }
        );
    }

    __recursiveAttemptAcquireToken(options, requestCallback, attemptCount) {
        //making call to vvClient to get access token
        Q
            .when(
                this.__getToken()
            )
            .then(
            function () {
                options.qs.token = this._token;

                //make call
                nodeJsRequest(options, function (error, response, body) {
                    requestCallback(error, response, body);
                });
            }
        )
            .fail(
            function (tokenError) {
                if (attemptCount < 6) {
                    attemptCount++;
                    this.__recursiveAttemptAcquireToken(options, requestCallback, attemptCount);
                }
            }
        );
    }

    __doVvClientRequest(url, opts, params, data) {
        var self = this;

        var deferred = Q.defer();

        var vvClientRequestCallback = function (error, response, responseData) {
            if (error) {
                console.log('In vvClientRequestCallback with error condition');
                deferred.reject(new Error(error));
            } else {
                if (response.statusCode === 403) {
                    self._token = null;
                    self._isAuthenticated = false;

                    var errorData = JSON.parse(responseData);
                    deferred.reject(new Error(errorData.meta));
                } else {
                    console.log('In vvClientRequestCallback with success: ' + responseData);
                    deferred.resolve(responseData);
                }
            }
        };

        if (opts.method === 'GET') {
            this.httpGet(url, params, vvClientRequestCallback);
        } else if (opts.method === 'POST') {
            this.httpPost(url, params, data, vvClientRequestCallback);
        } else if (opts.method === 'PUT') {
            this.httpPut(url, params, data, vvClientRequestCallback);
        } else if (opts.method === 'DELETE') {
            this.httpDelete(url, params, vvClientRequestCallback);
        } else {
            throw new Error('http request method name error');
        }

        return deferred.promise;
    }

    __getUrl(resourceUrl) {
        return this._baseUrl + this._apiUrl + resourceUrl;
    }

    __getToken() {
        var self = this;

        console.log("Getting token");

        //create deferred object containing promise
        var deferred = Q.defer();

        //read token key from config file
        var buff = new Buffer(this._developerSecret, "base64");

        var initiatedAtDate = new Date();
        var initiatedAtSeconds = parseInt((initiatedAtDate.getTime() / 1000).toString());
        //console.log('Initiated at date set to: ' + initiatedAtDate);

        var expireDate = new Date();
        expireDate.setMinutes(expireDate.getMinutes() + 30);
        var expireSeconds = parseInt((expireDate.getTime() / 1000).toString());
        //console.log('Expire date set to: ' + expireDate);


        var notBeforeDate = new Date();
        notBeforeDate.setMinutes(notBeforeDate.getMinutes() - 5);
        var notBeforeSeconds = parseInt((notBeforeDate.getTime() / 1000).toString());
        //console.log('Not before date set to: ' + notBeforeDate);


       // console.log("Creating claim");

        //setup claim portion of jwt token
        var claim = {
            iss: 'self:user',
            devid: this._developerId,
            prn: this._apiKey,
            aud: 'http://VisualVault/api',
            exp: expireSeconds,
            nbf: notBeforeSeconds,
            iat: initiatedAtSeconds
        };


       // console.log(claim);

        //create JWT token and sign it
        var token = jwt.encode(claim, buff, 'HS256');

        //setup response callback that will be called when request has completed
        var getTokenCallback = function (error, response, body) {
            if (error) {
                self._isAuthenticated = false;
                console.log('Error from acquiring token: ' + error);
                deferred.reject(new Error(error));
            } else {
                if (self._isDebugMode) {
                    console.log('Returned Status: ' + response.statusCode);
                    console.log('Returned Body: ' + response.body);
                }
                //console.log(response.body);
                if (response.statusCode == 200) {
                    var responseObject = JSON.parse(body);
                    self._token = responseObject.data.token;
                    self._isAuthenticated = true;

                    deferred.resolve(null);
                } else if (response.statusCode == 401 || response.statusCode == 403) {
                    self._isAuthenticated = false;
                    console.log("Authorization has been refused for current credentials");
                    deferred.reject(new Error("Authorization has been refused for current credentials"));
                } else {
                    self._isAuthenticated = false;
                    console.log("Unknown response for access token");
                    deferred.reject(new Error("Unknown response for access token"));
                }
            }
        };


        //determine url to request security token
        var urlSecurity = this._baseUrl + this._authenticationUrl;

        //setup authorization header section to be added to request headers
        //THIS IS WHERE WE NEED TO ADD THE HEADERS REQUIRED BY REST API
        // X-Authorization, X-VV-RequestDate
        var headers = {};
        headers["Authorization"] = "Bearer " + token;

        var rs = require('./requestSigning.js');
        rs.sign(headers, urlSecurity, 'GET', null, this._developerId, this._developerSecret, "SHA256");

        //create the options object for the request
        var options = { method: 'GET', uri: urlSecurity, headers: headers };

        //console.log(options);

        console.log("\n\nSending request for access token to " + urlSecurity + "\n\n");

        //make request for security token using signed JWT token
        nodeJsRequest(options, function (error, response, body) {
            getTokenCallback(error, response, body);
        });

        //return promise object
        return deferred.promise;
    }

}

(module).exports = VVRestApi;