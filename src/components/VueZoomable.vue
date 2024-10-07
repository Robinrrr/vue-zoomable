<template>
  <div ref="container" class="container" :class="$style.container">
    <slot></slot>

    <ControlButtons v-if="props.enableControlButton" @button-pan="buttonPan" @button-zoom="buttonZoom"
      @button-home="buttonHome" />

    <ScrollOverlay v-model="showOverlay">
      Use '{{ props.allowWheelOnKey }}' + 'scroll' to zoom.
    </ScrollOverlay>
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
const showOverlay = defineModel('showOverlay', { default: false });

const hideOverlay: Ref<boolean> = ref(true);

interface Props {
  selector?: string;
  minZoom?: number;
  maxZoom?: number;
  maxPan?: number;

  zoomSpeed?: number;
  zoomStep?: number;
  panStep?: number;

  homeX?: number;
  homeY?: number;
  homeZoom?: number;

  keepOverlayOpen?: number;

  panEnabled?: boolean;
  zoomEnabled?: boolean;

  enablePointer?: boolean;
  enableWheel?: boolean;

  enableDoubleClick?: boolean;
  enableControlButton?: boolean;

  allowWheelOnKey?: string;
  debug?: boolean;
  keepDraggingDelay?: number;
}

const props = withDefaults(defineProps<Props>(), {
  selector: '* > *',
  minZoom: 0.5,
  maxZoom: 3,
  maxPan: -1,

  zoomSpeed: 1,
  zoomStep: 0.4,
  panStep: 15,

  panEnabled: true,
  zoomEnabled: true,

  homeX: 0,
  homeY: 0,
  homeZoom: 1,

  keepOverlayOpen: 1000,

  enablePointer: true,
  enableDoubleClick: true,
  enableWheel: true,
  enableControlButton: true,

  allowWheelOnKey: 'Control',
  keepDraggingDelay: 10,
  debug: false,
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

  showOverlay.value = false;
  zoom.value = absolute;
}

function setPanX() {
  showOverlay.value = false;
}

function setPanY() {
  showOverlay.value = false;
}


let lastOverlay = Date.now()
function changeShowOverlay() {
  if (showOverlay.value) {
    lastOverlay = Date.now();

    setTimeout(() => {
      if (lastOverlay + props.keepOverlayOpen < Date.now()) {
        showOverlay.value = false;
      }
    }, props.keepOverlayOpen + 10);
  }
}

watch(zoom, () => { setZoom() });
watch(panX, setPanX);
watch(panY, setPanY);
watch(transform, () => { setTransform(); });
watch(showOverlay, changeShowOverlay);
onMounted(() => {
  setTransform();
});


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
    evCache.push(ev);
    log('pointerDown', ev);
  }

  function pointerup_handler(ev: PointerEvent) {
    log(ev.type, ev);
    remove_event(ev);

    movingEvId.delete(ev.pointerId);
    setTimeout(() => {
      dragging.value = movingEvId.size > 0;
    }, props.keepDraggingDelay);

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
    if (props.enablePointer) {
      container.value.onpointerdown = pointerdown_handler;
      window.onpointerup = pointerup_handler;
      window.onpointermove = pointermove_handler;
    }
  } else {
    console.warn("couldn't find container.");
  }
});

//mousewheel
onMounted(() => {
  const pressedKeys = ref(new Set<String>());

  document.addEventListener('keydown', event => {
    pressedKeys.value.add(event.key);
    if (event.key === props.allowWheelOnKey) hideOverlay.value = true;
  });
  document.addEventListener('keyup', (event) => { pressedKeys.value.delete(event.key); });

  function onWheel(event: WheelEvent) {
    // check if all conditions are met to scroll
    if (props.allowWheelOnKey !== undefined && !pressedKeys.value.has(props.allowWheelOnKey)) {
      showOverlay.value = true;
      return;
    }

    setZoom({ relative: props.zoomStep * event.deltaY / Math.abs(event.deltaY) });
  }

  function disableZoom(event: WheelEvent) {
    if (event.ctrlKey) event.preventDefault();
  }

  if (props.enableWheel) {
    document.addEventListener('wheel', onWheel);

    container.value?.addEventListener('mouseenter', () => {
      window.addEventListener('wheel', disableZoom, { passive: false });
    });

    container.value?.addEventListener('mouseleave', () => {
      window.removeEventListener('wheel', disableZoom)
    });
  }
})

// double click
onMounted(() => {
  if (props.enableDoubleClick) {
    container.value?.addEventListener('dblclick', event => {
      if (container.value) {
        const deltaX = ((event.clientX - container.value.offsetLeft) - (0.5 * container.value.offsetWidth)) / zoom.value;
        const deltaY = ((event.clientY - container.value.offsetTop) - (0.5 * container.value.offsetHeight)) / zoom.value;

        panX.value -= deltaX;
        panY.value -= deltaY;
      }

      zoom.value = zoom.value + props.zoomStep;
    });
  }
})

function buttonPan(direction: { x: number, y: number }) {
  panX.value += props.panStep * direction.x;
  panY.value += props.panStep * direction.y;
}

function buttonZoom(direction: number) {
  zoom.value += props.zoomStep * direction;
}

function buttonHome() {
  panX.value = props.homeX;
  panY.value = props.homeY;
  zoom.value = props.homeZoom;
}

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
