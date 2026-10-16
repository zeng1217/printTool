<script setup>
defineProps({
  data: { type: Object, required: true },
  size: { type: Object, required: true }, // { width, height } 预览用横向内容尺寸
  id: { type: String, default: null },
});
</script>

<template>
  <div class="ticket-wrapper" :id="id" :style="size">
    <div>
      <div class="ticket-header">
        <span>{{ data.orderSeq }}</span>
        <span>{{ data.shopName }}</span>
      </div>
      <div class="ticket-nickname-box">
        <span class="ticket-nickname-label">昵称:</span>
        <span class="ticket-nickname-val">{{ data.nickname }}</span>
      </div>
      <div class="ticket-receiver-box">
        <span>{{ data.receiverName }}</span>
        <span>{{ data.receiverArea }}</span>
      </div>
      <div class="ticket-goods-title">{{ data.goodsName }}</div>
      <div class="ticket-goods-notice">{{ data.goodsNotice }}</div>
    </div>
    <div>
      <div class="ticket-footer-row">
        <span>数量:{{ data.goodsQty || 1 }} 金额:{{ data.orderPrice }}</span>
        <span style="font-size: 8.5px">{{ data.orderTime }}</span>
      </div>
      <div class="ticket-footer-notice">
        单号:{{ data.orderId }} (一经售出概不退换)
      </div>
    </div>
  </div>
</template>
