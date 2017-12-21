"use strict";
// redis集群对象
global.Redis = require('../lib/session');

Redis({
    sessionKey: 'testsid',            // session名称
    sidPrefix: 'www.jay.com',         // session id value 前缀
    secret: Date.now(),               // 加密盐
    expires: 30 * 60 * 1000,          // 过期时间（毫秒）
    redisNodes: []                    // 集群节点配置
});