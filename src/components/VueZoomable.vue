<template>
  <div ref="container" class="container" :class="$style.container">
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
import { relative } from 'path';

const zoom = defineModel('zoom', { default: 1 });
const panX = defineModel('panX', { default: 0 });
const panY = defineModel('panY', { default: 0 });
const dragging = defineModel('dragging', { default: false });

const hideOverlay: Ref<boolean> = ref(true);

let props = defineProps({
  selector: {
    type: String,
    default: "* > *",
  },

  minZoom: {
    type: Number,
    default: 0.5,
  },
  maxZoom: {
    type: Number,
    default: 3,
  },

  maxPan: {
    type: Number,
    default: -1,
  },

  zoomSpeed: {
    type: Number,
    default: 1,
  },

  initialZoom: {
    type: Number,
    default: 0.5,
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
    default: true,
  },
  draggingDelay: {
    type: Number,
    default: 10,
  },
});

let container = ref<HTMLElement>();
let transformTarget = computed<HTMLElement>(() => container.value?.querySelector(props.selector) as HTMLElement)

let transform = computed(() => {
  return `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`;
});

function setTransform() {
  if (!transformTarget.value) return;
  transformTarget.value.style.transform = transform.value;
}

function setZoom({ absolute = undefined, relative = 0 }: { absolute?: number, relative?: number } = {}) {
  absolute = (absolute === undefined ? zoom.value : absolute) + relative;

  if (absolute < props.minZoom) absolute = props.minZoom;
  if (absolute > props.maxZoom) absolute = props.maxZoom;

  zoom.value = absolute;
}

function setPanX({ absolute = undefined, relative = 0 }: { absolute?: number, relative?: number } = {}) {
  absolute = (absolute === undefined ? zoom.value : absolute) + relative;
  panX.value = absolute;
}

function setPanY({ absolute = undefined, relative = 0 }: { absolute?: number, relative?: number } = {}) {
  absolute = (absolute === undefined ? zoom.value : absolute) + relative;
  panY.value = absolute;
}

watch(zoom, () => { setZoom() });
watch(transform, () => { setTransform(); });

// support touch
onMounted(() => {
  let movingEvId = new Set();
  let evCache = new Array();
  let prevDiff = -1;

  function log(prefix: String, ev: PointerEvent) {
    if (!props.debug) return;

    var s =
      prefix +
      ': pointerID = ' +
      ev.pointerId +
      ' ; pointerType = ' +
      ev.pointerType +
      ' ; isPrimary = ' +
      ev.isPrimary;

    console.log(s);
  }

  function remove_event(ev: PointerEvent) {
    for (var i = 0; i < evCache.length; i++) {
      if (evCache[i].pointerId == ev.pointerId) {
        evCache.splice(i, 1);
        break;
      }
    }
  }

  function pointerdown_handler(ev: PointerEvent) {
    if (ev.pointerType === "mouse" && !props.mouseEnabled) return;
    if (ev.pointerType === "touch" && !props.touchEnabled) return;

    evCache.push(ev);

    log('pointerDown', ev);
  }

  function pointerup_handler(ev: PointerEvent) {
    log(ev.type, ev);
    remove_event(ev);

    movingEvId.delete(ev.pointerId);
    setTimeout(() => {
      dragging.value = movingEvId.size > 0;
    }, props.draggingDelay);

    if (evCache.length < 2) prevDiff = -1;
  }

  function pointermove_handler(ev: PointerEvent) {
    log('pointerMove', ev);

    let previousEvent = undefined;
    for (var i = 0; i < evCache.length; i++) {
      if (ev.pointerId == evCache[i].pointerId) {
        previousEvent = evCache[i];
        evCache[i] = ev;
        break;
      }
    }

    if (previousEvent == undefined) {
      log('pointerOutsideOfContainer', ev);
      return
    }

    movingEvId.add(ev.pointerId);
    dragging.value = true;

    // If two pointers are down, check for pinch gestures
    if (evCache.length == 2) {
      if (!props.zoomEnabled) return;

      // Calculate the distance between the two pointers
      var curDiff = Math.sqrt(
        Math.pow(evCache[1].clientX - evCache[0].clientX, 2) +
        Math.pow(evCache[1].clientY - evCache[0].clientY, 2),
      );

      if (prevDiff > 0) {
        zoom.value += (curDiff - prevDiff) * 0.01 * props.zoomSpeed;
      }

      // Cache the distance for the next move event
      prevDiff = curDiff;
    }

    else if (evCache.length == 1) {
      if (!props.panEnabled) return;

      panX.value = panX.value + (ev.clientX - previousEvent.clientX);
      panY.value = panY.value + (ev.clientY - previousEvent.clientY);

    }
  }

  if (container.value) {
    container.value.onpointerdown = pointerdown_handler;
  }
  window.onpointerup = pointerup_handler;
  window.onpointermove = pointermove_handler;
});



/*
onMounted(() => {
  const placeholder = document.createElement('div');
  const scrollOverlayApp = createApp(ScrollOverlay, { enableWheelOnKey: props.enableWheelOnKey });

  // needs to be injected before it is mounted
  scrollOverlayApp.provide("hideOverlay", { hideOverlay });

  scrollOverlayApp.mount(placeholder)
  container.value.appendChild(placeholder);

  setTransform();
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

let mouse = useMouse(props, emit, pan, zoom, updateHideOverlay);
onMounted(() => {
  useTouch(props, emit, pan, zoom, updateHideOverlay, container, dragging);
})
let wheel = useWheel(props, emit, pan, zoom, pressedKeys, updateHideOverlay);
let button = useButtons(props, emit, pan, zoom, updateHideOverlay);

function onMouseDown(event: MouseEvent) {
  updateHideOverlay(true);
  mouse.onMouseDown(event);
}
*/
</script>

<style module>
.container {
  overflow: hidden;
  position: relative;

  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;

  touch-action: none;
}
</style>
