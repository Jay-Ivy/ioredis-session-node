"use strict";
// redis集群对象
global.Redis = require('../lib/session')({
    sessionKey: 'testsid',            // session名称
    sidPrefix: 'www.jay.com',         // session id value 前缀
    secret: Date.now(),               // 加密盐
    expires: 30 * 60 * 1000,          // 过期时间（毫秒）
    redisNodes: [
        {"port":"7000","host":"192.168.2.210"},
        {"port":"7001","host":"192.168.2.210"},
        {"port":"7002","host":"192.168.2.210"},
        {"port":"7003","host":"192.168.2.210"},
        {"port":"7004","host":"192.168.2.210"},
        {"port":"7005","host":"192.168.2.210"}
    ]                    // 集群节点配置
});

console.log(Redis.Cluster);