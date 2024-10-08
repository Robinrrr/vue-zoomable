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
import ControlButtons from "./ControlButtons.vue";
import ScrollOverlay from './ScrollOverlay.vue';
import { debug } from 'console';

const zoom = defineModel('zoom', { default: 1 });
const pan = defineModel('pan', {
  default: {
    x: 0,
    y: 0,
  }
});
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
  panPerStep?: number;

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
  panPerStep: 2,

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

const transformPanCache = computed(() => {
  return 0.5 * (1 - zoom.value);
});
const transformPan = computed(() => {
  if (!transformTarget.value) {
    return {
      x: 0,
      y: 0,
    }
  }

  return {
    x: pan.value.x - (transformTarget.value.offsetWidth * transformPanCache.value),
    y: pan.value.y - (transformTarget.value.offsetHeight * transformPanCache.value)
  };
});

let transform = computed(() => {
  return `translate(${transformPan.value.x}px, ${transformPan.value.y}px) scale(${zoom.value})`;
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
watch(pan, () => {
  showOverlay.value = false;
}, { deep: true });
watch(transform, () => { setTransform(); });
watch(showOverlay, changeShowOverlay);
onMounted(() => {
  setTransform();
});

const transformDimensions = computed(() => {
  return {
    x: transformTarget.value.offsetWidth * zoom.value,
    y: transformTarget.value.offsetHeight * zoom.value,
  };
});
const containerDimensions = computed(() => {
  if (!container.value) {
    console.warn("couldn't find container");
    return transformDimensions.value;
  }

  return {
    x: container.value.offsetWidth,
    y: container.value.offsetHeight,
  };
});

function positionToPan({ x = 0, y = 0 }) {
  /*
  Transforms coordinates relative to the viewport to be relative to the container instead
  */

  if (!container.value) {
    console.warn("container doesn't exist.");
    return { x, y };
  }

  const boundingRect = container.value.getBoundingClientRect();

  return {
    x: x - boundingRect.left,
    y: y - boundingRect.top,
  };
}

function zoomInto({
  change = 1,
  position = { x: 0, y: 0 },
  alpha = undefined,
  centerPosition = false,
}: { change?: number, position?: { x: number, y: number }, alpha?: number, centerPosition?: boolean }) {
  function log(name: string, value: any) {
    if (!props.debug) return;

    console.log("zoom into: " + name, value)
  }

  // calculating new zoom
  zoom.value = zoom.value + (change * props.zoomStep);

  // calculating new pan
  const eventPosition = positionToPan(position);

  log('zoom', zoom.value)
  log('event position', eventPosition);
  log('pan', {
    x: pan.value.x,
    y: pan.value.y,
  });
  log('dimensions', transformDimensions.value)

  // calculate how close I want to go towards the goal
  // number between 0 and 1
  if (alpha === undefined) {
    alpha = props.panPerStep * change;
    if (alpha > 1) alpha = 1;
  }

  log("alpha", alpha);

  let directionVector: { x: number, y: number };
  if (centerPosition) {
    // the place of the transform object of where the mouse cursor was is now in the center
    directionVector = {
      x: 0.5 * containerDimensions.value.x - eventPosition.x,
      y: 0.5 * containerDimensions.value.y - eventPosition.y,
    };
  } else {
    // the center of the transform object will be there, where the mouse cursor was
    directionVector = {
      x: eventPosition.x - (pan.value.x + 0.5 * transformDimensions.value.x),
      y: eventPosition.y - (pan.value.y + 0.5 * transformDimensions.value.y)
    };
  }

  log('direction', directionVector)

  pan.value = {
    x: pan.value.x + alpha * directionVector.x,
    y: pan.value.y + alpha * directionVector.y,
  };
}

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

    // zoom (two fingers are touching)
    if (evCache.length == 2) {
      if (!props.zoomEnabled) return;

      const a = {
        x: evCache[0].clientX,
        y: evCache[0].clientY,
      };
      const b = {
        x: evCache[1].clientX,
        y: evCache[1].clientY,
      };
      const zoomPosition = {
        x: (a.x + b.x) * 0.5,
        y: (a.y + b.y) * 0.5,
      };

      // Calculate the distance between the two pointers
      var curDiff = Math.sqrt(
        Math.pow(b.x - a.x, 2) +
        Math.pow(b.y - a.y, 2),
      );

      if (prevDiff > 0) {
        console.log("eeeeeeeeeeee")
        zoomInto({
          change: (curDiff - prevDiff) * 0.025,
          position: zoomPosition,
          alpha: 1,
        });
        // zoom.value += (curDiff - prevDiff) * 0.025 * props.zoomStep;
      }

      // Cache the distance for the next move event
      prevDiff = curDiff;
    }

    // pan (only one finger is touching)
    else if (evCache.length == 1) {
      if (!props.panEnabled) return;

      pan.value = {
        x: pan.value.x + (ev.clientX - previousEvent.clientX),
        y: pan.value.y + (ev.clientY - previousEvent.clientY),
      };
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
      zoomInto({
        change: 0,
        position: {
          x: event.clientX,
          y: event.clientY
        },
        alpha: 1,
        centerPosition: true,
      });
    });
  }
})

function buttonPan(direction: { x: number, y: number }) {
  pan.value = {
    x: pan.value.x + direction.x,
    y: pan.value.y + direction.y,
  }
}

function buttonZoom(direction: number) {
  zoom.value += props.zoomStep * direction;
}

function buttonHome() {
  console.clear();

  pan.value = {
    x: props.homeX,
    y: props.homeY,
  };
  zoom.value = props.homeZoom;
}

defineExpose({
  props,
  zoom,
  pan,
  dragging,
  showOverlay,
});
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
