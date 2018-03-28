"use strict";

let Redis = require('ioredis'),
    _ = require('lodash'),
    uuid = require('node-uuid'),
    Promise = require('bluebird'),
    SESSION = require('../enums/session'),
    crypto = require('crypto');

// 配置信息
let config = {
    secret: Math.random(),       // 加密盐
    sessionKey: 'sid',           // session名称
    sidPrefix: '',               // session sid value 前缀
    keepAlive: true,             // 是否保持session
    expires: 30 * 60 * 1000,     // 过期时间（毫秒）
    path: "/",
    httpOnly: true,
    secure: false,
    csrf: {
        // 是否开启CSRF
        able: true,
        // CSRF key值
        key: SESSION.CSRF,
        // 忽略方法
        ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
        // 获得值
        value: function(req) {
            return req.param(SESSION.CSRF) || req.headers['csrf-token'] || req.headers['xsrf-token'] || req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];
        }
    },
    redisNodes: []               // 集群节点配置
};

/**
 * 根据系统请求域名路径
 * @param req
 * @returns {string}
 */
let getDomain = function(req) {
    return req.protocol + '://' + req.headers.host;
};

// 生成CSRF
let generateCSRF = () => {return uuid.v4().replace(/[\/\+\=\-]/g, '');}

/**
 * 生成标识位
 * @param val
 * @param secret
 * @returns {string}
 */
let sign = function (val, secret) {
    let now = Date.now() + Math.random();
    secret = crypto.createHash('md5').update(val + '.' + now).digest('hex');
    let secretStr1 = crypto.createHmac('sha1', secret).update(secret + '.' + now).digest('base64'),
        secretStr2 = crypto.createHmac('sha1', secret).update(val + '.' + now).digest('base64'),
        secretStr3 = crypto.createHmac('sha256', secret + '.' + now).update(secretStr1 + secretStr2).digest('base64'),
        secretLen = Math.round(secretStr3.length / 3);
    let secretStrArr = [secretStr3.substr(0, secretLen), secretStr1, secretStr3.substr(secretLen, secretLen), secretStr2, secretStr3.substr(secretLen * 2)];
    return secretStrArr.join('').replace(/[\/\+\=\-]/g, '');
};

/**
 * 获得随机数
 */
let getRandomNode = function() {
    let number = 8 + Math.round(Math.random() * 8);
    let node = [];
    while(number--) {
        node.push(Math.floor(Math.random() * 256));
    }
    return node;
};


/**
 * 生成session对象
 * @param req   request对象
 * @param res   response对象
 * @returns {{}}
 */
let generate = function (req, res) {
    let session = {};
    let time = new Date().getTime();
    session.id = config.sidPrefix + sign(uuid.v1({
            node: getRandomNode(),
            clockseq: 0x1234,
            msecs: new Date('1991-04-11').getTime(),
            nsecs: 1122
        }), config.secret);
    //session.id = config.sidPrefix + uuid.v4().replace(/[\/\+\=\-]/g, '');
    session.expires = time + config.expires;
    session[config.csrf.key] = generateCSRF();
    req.session = session;
    writeHead(req, res);
    return session;
};
/**
 * 设置cookie信息
 * @param req
 * @param res
 */
let writeHead = function (req, res) {
    if (req.session && req.session.id) {
        res.cookie(config.sessionKey, req.session.id, {
            httpOnly: config.httpOnly,
            secure: config.secure,
            path: config.path,
            signed: req.secret ? true : false
        });
        // 判断是否开启csrf
        //if (config.csrf.able) {
        //    res.cookie(config.csrf.key, req.session[config.csrf.key], {
        //        httpOnly: config.httpOnly,
        //        secure: config.secure,
        //        path: config.path,
        //        signed: req.secret ? true : false
        //    });
        //}
    }
};

// 验证csrf
let checkCSRF = function(req, csrf) {
    let referer = req.headers.referer || getDomain(req), method = (req.method || 'get').toUpperCase();
    if (config.csrf.ignoreMethods.indexOf(method) < 0 && new RegExp(req.headers.host).test(referer) && config.csrf.value(req) === csrf) {
        return true;
    } else {
        return false;
    }
};

// redis集群
let redisCluster, notConn = true;
/**
 * 刷新Reids
 * @param req
 * @param res
 * @returns {*}
 */
let refreshRedis = function(req, res) {
    let session = req.session || {}, id = req.session && req.session.id;
    session.expires = Date.now() + config.expires;
    writeHead(req, res);
    return id ? redisCluster.expire(id, config.expires / 1000) : new Promise((resolve, reject) => {resolve({});});
};

// redis session对象
module.exports = function session(options) {
    _.merge(config, options);

    // 创建redis集群
    redisCluster = new Redis.Cluster(config.redisNodes);
    if (!config.redisNodes || config.redisNodes.length == 0) {
        console.info('not redis nodes info');
        return (req, res, next) => { next(); };
    }

    redisCluster.on('error', (err) => { console.error(err); notConn = true; });
    redisCluster.on('connect', () => { console.info('redisCluster connect'); notConn = false; });

    return (req, res, next) => {
        req.csrfToken = function() {
            return this.session && this.session[config.csrf.key];
        };
        let id = req.cookies[config.sessionKey];
        if (!id) {
            req.session = generate(req, res);
            save(req, res, next);
        } else if (notConn) {
            console.error('redisCluster not connection!');
            if (!req.session) {
                req.session = generate(req, res);
            }
            save(req, res, next);
        } else {
            redisCluster.hget(id, 'session').then((reply) => {
                let time = Date.now();
                let expires = time + config.expires, session = {id: id, expires: expires};
                session[config.csrf.key] = generateCSRF();
                if (reply) {
                    session = JSON.parse(reply);
                    if (session.expires > time) {
                        if (config.keepAlive) {
                            session.expires = expires;
                        }
                    }
                } else {
                    session = generate(req, res);
                }
                // csrf verification
                if (config.csrf.able && session[config.csrf.key] && !checkCSRF(req, session[config.csrf.key])) {
                    var err = new Error('CSRF verification failed, Request aborted.');
                    err.status = '403';
                    next(err);
                } else if (config.keepAlive) {
                    save(req, res, next);
                } else {
                    next();
                }
            }).catch((err) => {
                console.error(err);
                req.session = generate(req, res);
                save(req, res, next);
            });
        }
    };
};

// 保存
let save = function (req, res, next) {
    let id = req.session && req.session.id;
    if (!notConn && id) {
        let json = JSON.stringify(req.session);
        redisCluster.hset(id, 'session', json)
            .then(() => { return refreshRedis(req, res) })
            .then(() => { next(); })
            .catch((err) => { console.error(err) && next();});
    } else {
        next();
    }
};

// 重置session
let reset = function (req, res, next) {
    let id = req.cookies[config.sessionKey];
    if (!notConn && id) {
        res.clearCookie(config.sessionKey, {
            httpOnly: config.httpOnly,
            secure: config.secure,
            path: config.path,
            signed: req.secret ? true : false
        });
        //if (config.csrf.able) {
        //    res.clearCookie(config.csrf.key, {
        //        httpOnly: config.httpOnly,
        //        secure: config.secure,
        //        path: config.path,
        //        signed: req.secret ? true : false
        //    });
        //}
        generate(req, res);
        redisCluster.hdel(id, 'session').then(() => { next(); }).catch((err) => { console.error(err) && next(); });
    } else {
        generate(req, res);
        next();
    }
};

module.exports.save = (req, res, next) => {
    if (next) {
        save(req, res, next);
    } else {
        return new Promise((resolve, reject) => {
                save(req, res, () => { resolve({})});
        });
    }
};
module.exports.reset = reset;
module.exports.Cluster = redisCluster;