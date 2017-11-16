let Redis = require('ioredis'),
    util = require('lodash'),
    uuid = require('node-uuid'),
    Promise = require('bluebird'),
    crypto = require('crypto');

// 配置信息
let config = {
    secret: Math.random(),       // 加密盐
    sessionKey: 'sid',           // session名称
    sidPrefix: '',               // session sid value 前缀
    refreshSession: true,        // 是否刷新session时间
    expires: 30 * 60 * 1000,     // 过期时间（毫秒）
    path: "/",
    httpOnly: true,
    redisNodes: []               // 集群节点配置
};

/**
 * 生成标识位
 * @param val
 * @param secret
 * @returns {string}
 */
let sign = function (val, secret) {
    LOG.debug('[' + secret + ']' + val);
    let now = Date.now() + Math.random();
    secret = crypto.createHash('md5').update(val + '.' + now).digest('hex');
    let secretStr1 = crypto.createHmac('sha1', secret).update(secret + '.' + now).digest('base64'),
        secretStr2 = crypto.createHmac('sha1', secret).update(val + '.' + now).digest('base64'),
        secretStr3 = crypto.createHmac('sha256', secret + '.' + now).update(secretStr1 + secretStr2).digest('base64'),
        secretLen = Math.round(secretStr3.length / 3);
    secretStrArr = [secretStr3.substr(0, secretLen), secretStr1, secretStr3.substr(secretLen, secretLen), secretStr2, secretStr3.substr(secretLen * 2)];
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
    LOG.debug(node);
    return node;
};


/**
 * 生成session对象
 * @param req   request对象
 * @param res   response对象
 * @param id    若id存在，则重置过期时间
 * @returns {{}}
 */
let generate = function (req, res, id) {
    let session = {};
    let time = new Date().getTime();
    session.id = config.sidPrefix + sign(uuid.v1({
            node: getRandomNode(),
            clockseq: 0x1234,
            msecs: new Date('1991-04-11').getTime(),
            nsecs: 1122
        }), config.secret);
    //session.id = config.sidPrefix + uuid.v4().replace(/[\/\+\=\-]/g, '');
    LOG.debug(session.id);
    session.expires = time + config.expires;
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
            path: config.path,
        });
    }
};

// redis集群
let redisCluster, notConn = false;
/**
 * 刷新Reids
 * @param req
 * @param res
 * @returns {*}
 */
let refreshRedis = function(req, res) {
    let session = req.session || {};
    session.expires = Date.now() + config.expires;
    writeHead(req, res);
    if (req.session && req.session.id) {
        return redisCluster.expire(req.session.id, config.expires / 1000);
    } else {
        return new Promise(function (resolve, reject) {
            resolve({});
        });
    }
};

// redis session对象
module.exports = function session(options) {
    util.extend(config, options || {});

    // 创建redis集群
    redisCluster = new Redis.Cluster(config.redisNodes);

    redisCluster.on('error', function (err) {
        LOG.error('redisCluster error');
        LOG.error(err);
        notConn = true;
    });
    redisCluster.on('connect', function (err) {
        LOG.info('redisCluster connect');
        notConn = false;
    });

    return function session(req, res, next) {
        let id = req.cookies[config.sessionKey];
        if (!id) {
            req.session = generate(req, res);
            save(req, res).done(function() {
                next();
            });
        } else if (notConn) {
            if (!req.session) {
                req.session = generate(req, res, id);
            }
            save(req, res).done(function() {
                next()
            });
        } else {
            redisCluster.hget(id, 'session').then(function (reply) {
                let time = Date.now();
                let expires = time + config.expires, session = {id: id, expires: expires};
                if (reply) {
                    session = JSON.parse(reply);
                    if (session.expires > time) {
                        if (config.refreshSession) {
                            session.expires = expires;
                        }
                    }
                } else {
                    session = generate(req, res);
                }
                req.session = session;
                if (config.refreshSession) {
                    save(req, res).done(function() {
                        next();
                    });
                } else {
                    next();
                }
            }).catch(function (err) {
                LOG.error(err);
                req.session = generate(req, res);
                save(req, res).done(function() {
                    next()
                });
            });
        }
    };
};

// 保存
let save = function (req, res, callback) {
    if (notConn) {
        if (callback) {
            callback();
        }
        return new Promise(function (resolve, reject) {
            resolve({});
        });
    }
    let id = req.session && req.session.id;
    if (!id) {
        if (callback) {
            callback();
        }
        return new Promise(function (resolve, reject) {
            resolve({});
        });
    }
    let json = JSON.stringify(req.session);
    return redisCluster.hset(id, 'session', json).then(function (reply) {
        return refreshRedis(req, res);
    });
};
module.exports.save = save;

// 重置session
let reset = function (req, res, next) {
    let id = req.cookies[config.sessionKey];
    if (!notConn && id) {
        res.clearCookie(config.sessionKey);
        redisCluster.hdel(id, 'session', function (err) {
            if (err) {
                LOG.error('redis reset error');
                LOG.error(err);
            }
            next();
        });
    } else {
        next();
    }
};
module.exports.reset = reset;
module.exports.Cluster = redisCluster;