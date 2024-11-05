<template>
  <div ref="container" class="container" :class="$style.container">
    <slot></slot>
    <ControlButtons v-if="props.enableControllButton" @button-home="button.onHome" @button-pan="button.onPan"
      @button-zoom="button.onZoom"></ControlButtons>

    <ScrollOverlay v-model="showOverlay">
      Use '{{ props.enableWheelOnKey }}' + 'scroll' to zoom.
    </ScrollOverlay>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, Ref, createApp, onMounted, watch, nextTick } from 'vue';
import { useButtons } from "../composables/useButtons";
import ControlButtons from "./ControlButtons.vue";
import ScrollOverlay from './ScrollOverlay.vue';

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
  keepOverlayOpen: {
    type: Number,
    default: 1000,
  }
});

let container = ref();
let transformTarget = computed<HTMLElement>(() => container.value?.querySelector(props.selector))

const dragging = defineModel('dragging', { default: false });
const showOverlay = defineModel('showOverlay', { default: false });
const zoom = defineModel('zoom', { default: 1 });
const pan = defineModel('pan', { default: { x: 0, y: 0 } });

/*
 * ################################# WATCHERS #################################
 */
{
  watch(zoom, () => {
    showOverlay.value = false;

    if (zoom.value < props.minZoom) zoom.value = props.minZoom;
    else if (zoom.value > props.maxZoom && props.maxZoom > 0) zoom.value = props.maxZoom;
  });

  watch(pan, () => {
    showOverlay.value = false;
  }, { deep: true });

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
  watch(showOverlay, changeShowOverlay);

  let transform = computed(() => {
    return `translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`;
  });

  function setTransform() {
    if (!transformTarget.value) return;
    transformTarget.value.style.transform = transform.value;
  }

  watch(transform, setTransform, { flush: "post" });
  onMounted(setTransform);
}

function getCenter(info: DOMRect) {
  return {
    x: info.x + .5 * info.width,
    y: info.y + .5 * info.height,
  };
}

function centerElement(element: HTMLElement) {
  centerPoint(getCenter(element.getBoundingClientRect()));
}

function centerPoint(pointToCenter: { x: number, y: number }) {
  const containerInfo = container.value.getBoundingClientRect();

  pan.value = {
    x: - (pointToCenter.x - containerInfo.x - pan.value.x) + .5 * containerInfo.width,
    y: - (pointToCenter.y - containerInfo.y - pan.value.y) + .5 * containerInfo.height,
  }
}

async function zoomIntoPoint(deltaZoom: number, oldPoint: { x: number, y: number }) {
  // changing the zoom, zooms into the center of transform target. 
  // thus I need to find the point, relative to the transform target center, 
  // to calculate by how much I need to shift the pan for each zoom
  const centerTransformTarget = getCenter(transformTarget.value.getBoundingClientRect());
  const normalizedDistance = {
    x: (oldPoint.x - centerTransformTarget.x) / zoom.value,
    y: (oldPoint.y - centerTransformTarget.y) / zoom.value,
  };

  zoom.value += deltaZoom;
  await nextTick();

  const newPoint = {
    x: (normalizedDistance.x * zoom.value) + centerTransformTarget.x,
    y: (normalizedDistance.y * zoom.value) + centerTransformTarget.y,
  };

  // move new point on the transform target to the old point on the canvas
  pan.value = {
    x: pan.value.x + (oldPoint.x - newPoint.x),
    y: pan.value.y + (oldPoint.y - newPoint.y),
  }
}

/*
 * ################################# DOUBLE CLICK #################################
 */
onMounted(() => {
  container.value.addEventListener('dblclick', (event: PointerEvent) => {
    centerPoint({ x: event.clientX, y: event.clientY });
    zoom.value += props.dblClickZoomStep;
  })
});

/*
 * ################################# MOUSEWHEEL #################################
 */
const pressedKeys: Set<String> = new Set<String>();
const isInContainer = ref(false);
onMounted(() => {
  // track the currently pressed keys, and mouse location
  document.addEventListener('keydown', (event) => { pressedKeys.add(event.key); });
  document.addEventListener('keyup', (event) => { pressedKeys.delete(event.key); });
  container.value.addEventListener('mouseenter', () => { isInContainer.value = true });
  container.value.addEventListener('mouseleave', () => { isInContainer.value = false });

  // prevent zooming in the viewport if necessary
  window.addEventListener('wheel', event => {
    if (!isInContainer.value || props.enableWheelOnKey !== "Control") return;
    if (event.ctrlKey) event.preventDefault();
  }, { passive: false });

  // the actual scrolling event within container
  container.value.addEventListener('wheel', (event: WheelEvent) => {
    // check if all conditions are met to scroll
    if (!props.wheelEnabled || !props.zoomEnabled) return;
    if (props.enableWheelOnKey !== undefined && !pressedKeys.has(props.enableWheelOnKey)) {
      showOverlay.value = true;
      return;
    }

    zoomIntoPoint(props.dblClickZoomStep * event.deltaY / Math.abs(event.deltaY), { x: event.clientX, y: event.clientY })
  });
});

/*
 * ################################# TOUCH/POINTER PAN/ZOOM #################################
 */
onMounted(() => {
  let movingEvId = new Set();
  let evCache = new Array();
  let prevDiff = -1;

  function remove_event(ev: PointerEvent) {
    for (var i = 0; i < evCache.length; i++) {
      if (evCache[i].pointerId == ev.pointerId) {
        evCache.splice(i, 1);
        break;
      }
    }
  }

  function pointerdown_handler(ev: PointerEvent) {
    if (ev.button === 1 || ev.button === 2) return;
    if (ev.pointerType === "mouse" && !props.mouseEnabled) return;
    if (ev.pointerType === "touch" && !props.touchEnabled) return;

    evCache.push(ev);
  }

  function pointerup_handler(ev: PointerEvent) {
    remove_event(ev);

    movingEvId.delete(ev.pointerId);
    setTimeout(() => {
      dragging.value = movingEvId.size > 0;
    }, props.draggingDelay);

    if (evCache.length < 2) prevDiff = -1;
  }

  function pointermove_handler(ev: PointerEvent) {
    let previousEvent = undefined;
    for (var i = 0; i < evCache.length; i++) {
      if (ev.pointerId == evCache[i].pointerId) {
        previousEvent = evCache[i];
        evCache[i] = ev;
        break;
      }
    }

    if (previousEvent == undefined) return;

    movingEvId.add(ev.pointerId);
    dragging.value = true;

    // If two pointers are down, check for pinch gestures
    if (evCache.length == 2) {
      // Calculate the distance between the two pointers
      var curDiff = Math.sqrt(
        Math.pow(evCache[1].clientX - evCache[0].clientX, 2) +
        Math.pow(evCache[1].clientY - evCache[0].clientY, 2),
      );

      if (prevDiff > 0) {
        const eventOrigin = {
          x: (evCache[0].clientX + evCache[1].clientX) / 2,
          y: (evCache[0].clientY + evCache[1].clientY) / 2,
        };

        zoomIntoPoint((curDiff - prevDiff) * 0.01, eventOrigin);

      }

      // Cache the distance for the next move event
      prevDiff = curDiff;
    }

    else if (evCache.length == 1) {
      if (!props.panEnabled) return;

      pan.value = {
        x: pan.value.x + (ev.clientX - previousEvent.clientX),
        y: pan.value.y + (ev.clientY - previousEvent.clientY),
      }

    }
  }

  container.value.onpointerdown = pointerdown_handler;
  window.onpointerup = pointerup_handler;
  window.onpointermove = pointermove_handler;

  container.value.style.touchAction = 'none';
})
let button = useButtons(props, pan, zoom);

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
