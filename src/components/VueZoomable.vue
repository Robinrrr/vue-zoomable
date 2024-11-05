<template>
  <div ref="container" class="container" :class="$style.container" @wheel="wheel.onWheel" @mouseleave="onMouseLeave"
    @mouseenter="onMouseEnter">
    <ControlButtons v-if="props.enableControllButton" @button-home="button.onHome" @button-pan="button.onPan"
      @button-zoom="button.onZoom" @mousedown="updateHideOverlay(true);"></ControlButtons>
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, Ref, createApp, onMounted, watch, ModelRef } from 'vue';
import { useMouse } from "../composables/useMouse";
import { useTouch } from "../composables/useTouch";
import { useWheel } from "../composables/useWheel";
import { useButtons } from "../composables/useButtons";
import ControlButtons from "./ControlButtons.vue";
import ScrollOverlay from './ScrollOverlay.vue';

const dragging = defineModel('dragging', { default: false });

const hideOverlay: Ref<boolean> = ref(true);

let props = defineProps({
  zoom: {
    type: Number,
    default: null,
  },

  pan: {
    type: Object,
    default: null,
  },
  selector: {
    type: String,
    default: "* > *",
  },
  maxZoom: {
    type: Number,
    default: 3,
  },
  minZoom: {
    type: Number,
    default: 0.5,
  },
  initialPanX: {
    type: Number,
    default: 0,
  },
  initialPanY: {
    type: Number,
    default: 0,
  },
  initialZoom: {
    type: Number,
    default: 1,
  },
  dblClickZoomStep: {
    type: Number,
    default: 0.4,
  },
  wheelZoomStep: {
    type: Number,
    default: 0.05,
  },
  panEnabled: {
    type: Boolean,
    default: true,
  },
  zoomEnabled: {
    type: Boolean,
    default: true,
  },
  mouseEnabled: {
    type: Boolean,
    default: true,
  },
  touchEnabled: {
    type: Boolean,
    default: true,
  },
  dblClickEnabled: {
    type: Boolean,
    default: true,
  },
  wheelEnabled: {
    type: Boolean,
    default: true,
  },
  enableControllButton: {
    type: Boolean,
    default: false,
  },
  buttonPanStep: {
    type: Number,
    default: 15,
  },
  buttonZoomStep: {
    type: Number,
    default: 0.1,
  },
  enableWheelOnKey: {
    type: String,
    default: undefined,
  },
  debug: {
    type: Boolean,
    default: false,
  },
  draggingDelay: {
    type: Number,
    default: 10,
  },
});

let container = ref();
let transformTarget = computed<HTMLElement>(() => container.value?.querySelector(props.selector))

const zoom = defineModel('zoom', { default: 1 });
const pan = defineModel('pan', { default: { x: 0, y: 0 } });

function centerElement(element: HTMLElement) {
  const elementInfo = element.getBoundingClientRect();

  function getCenter(info: DOMRect) {
    return {
      x: info.x + .5 * info.width,
      y: info.y + .5 * info.height,
    };
  }

  centerPoint(getCenter(element.getBoundingClientRect()));
}

function centerPoint(pointToCenter: { x: number, y: number }) {
  const containerInfo = container.value.getBoundingClientRect();

  pan.value = {
    x: - (pointToCenter.x - containerInfo.x - pan.value.x) + .5 * containerInfo.width,
    y: - (pointToCenter.y - containerInfo.y - pan.value.y) + .5 * containerInfo.height,
  }
}

watch(zoom, () => {
  hideOverlay.value = true;
});
watch(pan, () => {
  hideOverlay.value = true;
}, { deep: true });

let transform = computed(() => {
  return `translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`;
});

function setTransform() {
  if (!transformTarget.value) return;
  transformTarget.value.style.transform = transform.value;
}

watch(
  transform,
  () => {
    setTransform();
  },
  {
    flush: "post",
  }
);

onMounted(() => {
  const placeholder = document.createElement('div');
  const scrollOverlayApp = createApp(ScrollOverlay, { enableWheelOnKey: props.enableWheelOnKey });

  // needs to be injected before it is mounted
  scrollOverlayApp.provide("hideOverlay", { hideOverlay });

  scrollOverlayApp.mount(placeholder)
  container.value.appendChild(placeholder);

  setTransform();

  container.value.addEventListener('dblclick', (event: PointerEvent) => {
    centerPoint({ x: event.clientX, y: event.clientY });
    zoom.value += props.dblClickZoomStep;
  })
});


const pressedKeys: Ref<Set<String>> = ref(new Set<String>());

onMounted(() => {
  window.addEventListener(
    'wheel',
    event => {
      if (!isInContainer.value || props.enableWheelOnKey !== "Control") return;
      if (event.ctrlKey) event.preventDefault();
    }, { passive: false },
  );

  // track the keys, which are currently pressed
  document.addEventListener('keydown', (event) => {
    pressedKeys.value.add(event.key);
    if (event.key === props.enableWheelOnKey) hideOverlay.value = true;
  });
  document.addEventListener('keyup', (event) => { pressedKeys.value.delete(event.key); });
})

// track if the mouse is in the container
const isInContainer = ref(false);

// track when the mouse leaves, to then hide the overlay
function onMouseEnter() {
  isInContainer.value = true;
}
function onMouseLeave() {
  hideOverlay.value = true;
  isInContainer.value = false;
}

function showOverlay() { hideOverlay.value = false; }
function updateHideOverlay(newHideOverlay: boolean) { hideOverlay.value = newHideOverlay; }

let mouse = useMouse(props, pan, zoom, updateHideOverlay);
onMounted(() => {
  useTouch(props, pan, zoom, updateHideOverlay, container, dragging);
})
let wheel = useWheel(props, pan, zoom, pressedKeys, updateHideOverlay);
let button = useButtons(props, pan, zoom, updateHideOverlay);

function onMouseDown(event: MouseEvent) {
  updateHideOverlay(true);
  mouse.onMouseDown(event);
}

defineExpose({
  centerElement
})
</script>

<style module>
.container {
  overflow: hidden;
  position: relative;

  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}
</style>
