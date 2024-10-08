<template>
  <form>
    <div v-for="(propValue, propName) in childRef?.props" :key="propName">
      <template v-if="getType(propValue)">
        <label :for="propName">{{ propName }}</label>
        <input v-model="form[propName]" :id="propName" :type="getType(propValue)" />
      </template>

      <div v-else-if="typeof propValue === 'object'">
        <span>{{ propName }}</span>

        <template v-for="(innerValue, innerName) in propValue" :key="innerName">
          <div v-if="getType(innerValue)">
            <label :for="innerName">{{ innerName }}</label>
            <input v-model="form[propName][innerName]" :id="innerName" :type="getType(innerValue)" />
          </div>
        </template>
      </div>
    </div>

    <hr>

    <template v-if="childRef">
      <div v-for="(propValue, propName) in childRef" :key="propName">
        <template v-if="getType(propValue)">
          <label :for="propName">{{ propName }}</label>
          <input v-model="childRef[propName]" :id="propName" :type="getType(propValue)" />
        </template>

        <div v-else-if="typeof propValue === 'object' && propName !== 'props'">
          <span>{{ propName }}</span>

          <template v-for="(innerValue, innerName) in propValue" :key="innerName">
            <div v-if="getType(innerValue)">
              <label :for="innerName">{{ innerName }}</label>
              <input v-model="childRef[propName][innerName]" :id="innerName" :type="getType(innerValue)" />
            </div>
          </template>
        </div>
      </div>
    </template>
  </form>

  <VueZoomable ref="childRef" v-bind="form" style="width: 100%; aspect-ratio: 1; border: 1px solid black">
    <div id="zoomable-content">
      <div>
        <div></div>
        <div></div>
      </div>
      <div>
        <div></div>
        <div></div>
      </div>
    </div>
  </VueZoomable>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import VueZoomable from "../components/VueZoomable.vue";

function getType(value: any) {
  switch (typeof value) {
    case 'string':
      return 'text';

    case 'number':
      return 'number';

    case 'boolean':
      return 'checkbox'

    default:
      return;
  }
}


const childRef = ref<InstanceType<typeof VueZoomable> | null>(null); // Typing the childRef

// Form data initialized as an empty object
let form = ref<Record<string, any>>({});

onMounted(() => {
  if (childRef.value) {
    form.value = { ...childRef.value.props }
  }
});
</script>

<style>
#zoomable-content {
  display: flex;
  flex-direction: column;

  width: 400px;
  height: 400px;

  background-color: aqua;
}

#zoomable-content>div {
  display: flex;
  flex-direction: row;

}

#zoomable-content>div>div {
  margin: 50px;
  background-color: blue;
  height: 100px;
  width: 100px;
}
</style>
