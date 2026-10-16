<script setup>
import TicketCanvas from '../components/TicketCanvas.vue';
import { cfg, ticket, layout, simulate, doPrint, openLabelWindow } from '../store';
</script>

<template>
  <div class="section">
    <div class="desk-cols">
      <div class="col-form">
        <div class="section-title"><span class="t-left"><span class="bar"></span>当前订单</span></div>
        <div class="section-desc">新订单到达时自动填充；可从历史重新打印</div>

        <div class="form-grid">
          <div class="form-item span-2">
            <span class="lbl">买家昵称</span>
            <a-input v-model="ticket.nickname" placeholder="买家昵称" allow-clear />
          </div>
          <div class="form-item span-2">
            <span class="lbl">商品名称</span>
            <a-input v-model="ticket.goodsName" placeholder="商品名称" allow-clear />
          </div>
          <div class="form-item">
            <span class="lbl">数量</span>
            <a-input v-model="ticket.goodsQty" placeholder="1" />
          </div>
          <div class="form-item">
            <span class="lbl">实付金额</span>
            <a-input v-model="ticket.orderPrice" placeholder="0.00" />
          </div>
          <div class="form-item">
            <span class="lbl">收货人</span>
            <a-input v-model="ticket.receiverName" placeholder="收货人" allow-clear />
          </div>
          <div class="form-item">
            <span class="lbl">省市区</span>
            <a-input v-model="ticket.receiverArea" placeholder="省市区" allow-clear />
          </div>
          <div class="form-item span-2">
            <span class="lbl">订单号</span>
            <a-input v-model="ticket.orderId" placeholder="订单号" allow-clear />
          </div>
        </div>

        <div class="row-end">
          <a-button @click="simulate">本地模拟出单</a-button>
          <div class="btn-group">
            <a-button @click="openLabelWindow">独立预览窗口</a-button>
            <a-button type="primary" @click="doPrint">打印该标签</a-button>
          </div>
        </div>
      </div>

      <div class="col-preview">
        <div class="preview-label">实时预览 · {{ cfg.paperH }}×{{ cfg.paperW }}mm <a class="pop-link" @click="openLabelWindow">弹窗显示 ↗</a></div>
        <div class="preview-scale" :style="{ width: layout.Wd * 3.78 + 'px', height: layout.Hd * 3.78 + 'px' }">
          <TicketCanvas :layout="layout" :data="ticket" />
        </div>
      </div>
    </div>

    <div class="hint" style="margin-top: 16px">启动监听后会自动拉起 Edge/Chrome 打开抖店后台，首次需在该浏览器里登录一次（登录态本地保存）。</div>
  </div>
</template>

<style scoped>
.btn-group { display: flex; align-items: center; gap: 10px; }
.pop-link {
  margin-left: 8px; color: var(--primary); cursor: pointer; font-weight: 500; font-size: 12.5px;
}
.pop-link:hover { text-decoration: underline; }
</style>
