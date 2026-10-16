// ==UserScript==
// @name         抖店实时订单自动打单 (自动轮询出单版)
// @namespace    http://tampermonkey.net/
// @version      14.0
// @description  自动定时检查待发货新单并推送打印
// @match        https://fxg.jinritemai.com/*
// @match        *://*.jinritemai.com/*
// @match        http://127.0.0.1:5500/*
// @match        http://localhost:5500/*
// @include      http://127.0.0.1:5500*
// @include      http://localhost:5500*
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // -------------------------------------------------------------
    // 角色 A：打单接收页
    // -------------------------------------------------------------
    if (location.href.includes('127.0.0.1:5500') || location.href.includes('localhost:5500')) {
        console.warn('%c【打单端就绪】等待订单推送...', 'color: green; font-weight: bold;');
        GM_addValueChangeListener('LIVE_ORDER_PUSH', function (name, oldValue, newValue) {
            if (newValue && (newValue.nickname || newValue.orderId)) {
                window.postMessage({ type: 'DOUYIN_ORDER_DATA', data: newValue }, '*');
            }
        });
        return;
    }

    // -------------------------------------------------------------
    // 角色 B：抖店后台
    // -------------------------------------------------------------
    console.warn('%c【抖店抓单端就绪】开启自动轮询抓单...', 'color: #ff5722; font-weight: bold;');

    const processedOrders = new Set();
    let counter = 1;

    window.addEventListener('__DOUYIN_INTERCEPTED_ORDER__', function (e) {
        const item = e.detail;
        if (!item) return;

        const oId = String(item.shop_order_id || item.order_id || '');
        if (!oId || processedOrders.has(oId)) return;
        processedOrders.add(oId);

        let price = '20.00';
        const rawAmt = item.actual_pay_amount || item.pay_amount || item.order_amount;
        if (rawAmt !== undefined && rawAmt !== null) {
            price = (Number(rawAmt) / 100).toFixed(2);
        }

        let timeStr = new Date().toLocaleString();
        const rawTime = item.create_time || item.pay_time;
        if (rawTime) {
            const ms = Number(rawTime) > 100000000000 ? Number(rawTime) : Number(rawTime) * 1000;
            const d = new Date(ms);
            const pad = (n) => String(n).padStart(2, '0');
            timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }

        let goodsName = '【发饰自选】高颜值发饰可爱韩系甜美清新ins风发绳头';
        if (Array.isArray(item.sku_order_list) && item.sku_order_list.length > 0) {
            goodsName = item.sku_order_list[0].item_name || item.sku_order_list[0].product_name || goodsName;
        }

        const rInfo = item.receiver_info || {};
        const receiverName = rInfo.post_receiver || item.post_receiver || '曾*';
        const addr = rInfo.post_addr || {};
        const p = addr.province?.name || '';
        const c = addr.city?.name || '';
        const t = addr.town?.name || '';
        const receiverArea = (p || c) ? `${p}${c}${t}` : '江苏省无锡市新吴区';

        const payload = {
            orderSeq: `第${counter++}单`,
            orderId: oId,
            nickname: item.user_nickname || item.buyer_nick || '买家',
            goodsName: goodsName,
            orderPrice: price,
            orderTime: timeStr,
            receiverName: receiverName,
            receiverArea: receiverArea,
            _timestamp: Date.now()
        };

        console.warn('%c【捕获到待发货新单，推送打印】:', 'color: red; font-size: 14px; font-weight: bold;', payload);
        GM_setValue('LIVE_ORDER_PUSH', payload);
    });

    const injectedCode = `
    (function() {
        let lastFetchParams = null;

        function checkAndNotify(data) {
            if (!data || typeof data !== 'object') return;
            function emit(item) {
                if (item && (item.shop_order_id || item.order_id)) {
                    window.dispatchEvent(new CustomEvent('__DOUYIN_INTERCEPTED_ORDER__', { detail: item }));
                }
            }
            if (data.shop_order_id) {
                emit(data);
                return;
            }
            const list = data?.data?.list || data?.data?.shop_order_list || data?.data || data?.list || [];
            if (Array.isArray(list)) list.forEach(emit);
        }

        const origFetch = window.fetch;
        window.fetch = async function(...args) {
            const res = await origFetch.apply(this, args);
            try {
                const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
                if (url.toLowerCase().includes('searchlist')) {
                    // 保存当前的真实请求参数（包含所有筛选条件与认证头）
                    lastFetchParams = {
                        url: args[0],
                        options: args[1] ? JSON.parse(JSON.stringify(args[1])) : {}
                    };

                    const cloned = res.clone();
                    cloned.json().then(json => checkAndNotify(json)).catch(() => {});
                }
            } catch(e) {}
            return res;
        };

        // 每隔 4 秒自动静默轮询一次最新的待发货列表
        setInterval(function() {
            if (!lastFetchParams) return;
            origFetch(lastFetchParams.url, lastFetchParams.options)
                .then(r => r.json())
                .then(json => checkAndNotify(json))
                .catch(() => {});
        }, 4000);
    })();
    `;

    const script = document.createElement('script');
    script.textContent = injectedCode;
    (document.head || document.documentElement).appendChild(script);
    script.remove();

})();