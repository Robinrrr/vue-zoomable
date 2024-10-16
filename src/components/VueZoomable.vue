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

  homePanX?: number;
  homePanY?: number;
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

  homePanX: 0,
  homePanY: 0,
  homeZoom: 1,

  keepOverlayOpen: 1000,

  enablePointer: true,
  enableDoubleClick: true,
  enableWheel: true,
  enableControlButton: true,

  allowWheelOnKey: 'Control',
  keepDraggingDelay: 10,
  debug: true,
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


function checkZoomBounds(zoomValue: number) {
  if (props.minZoom > zoomValue) return props.minZoom;
  if (props.maxZoom < zoomValue) return props.maxZoom;
  return zoomValue;
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

watch(zoom, () => {
  zoom.value = checkZoomBounds(zoom.value);
  showOverlay.value = false;
});
watch(pan, () => {
  showOverlay.value = false;
}, { deep: true });
watch(transform, () => { setTransform(); });
watch(showOverlay, changeShowOverlay);
onMounted(() => {
  setTransform();
  buttonHome();
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

function eventPositionToVector({ x = 0, y = 0 }) {
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

enum PanDirectionMode {
  CenterMiddle,
  CenterEventOrigin,
}

enum AlphaMode {
  RelativeToZoom,
}

function zoomPan({
  change = 1,

  eventOrigin = undefined,
  panDirection = PanDirectionMode.CenterMiddle,
  panAdditionalDirection = { x: 0, y: 0 },
  alpha = 1,
}: {
  change?: number,

  eventOrigin?: { x: number, y: number }
  panDirection?: PanDirectionMode | { x: number, y: number },
  panAdditionalDirection?: { x: number, y: number },
  alpha?: number,
}) {
  function log(name: string, value: any) {
    if (!props.debug) return;

    if (name === "end") {
      console.log("zoom/pan: END OF FUNCTION CALL =============");
      return;
    }
    console.log("zoom/pan: " + name, value)
  }

  // calculating new zoom
  log('zoom', zoom.value);
  const prevZoom = zoom.value;
  const newZoom = zoom.value + (change * props.zoomStep);

  if (newZoom > props.maxZoom && props.maxZoom !== undefined) {
    zoom.value = props.maxZoom;
  } else if (newZoom < props.minZoom && props.minZoom !== undefined) {
    zoom.value = props.minZoom;
  } else {
    zoom.value = newZoom;
  }

  log('amount of zoom', Math.abs(prevZoom - zoom.value));

  let currentPan = pan.value;

  if (eventOrigin === undefined) {
    // if this isn't given I assume the center of the transform object
    eventOrigin = {
      x: currentPan.x + 0.5 * transformDimensions.value.x,
      y: currentPan.y + 0.5 * transformDimensions.value.y,
    };
  }

  const directionVector = computed(() => {
    if (panDirection === PanDirectionMode.CenterMiddle) {
      // the event origin will be centered
      return {
        x: eventOrigin.x - (currentPan.x + 0.5 * transformDimensions.value.x),
        y: eventOrigin.y - (currentPan.y + 0.5 * transformDimensions.value.y)
      };
    }

    if (panDirection === PanDirectionMode.CenterEventOrigin) {
      // the transform object will be centered on the event origin
      return {
        x: 0.5 * containerDimensions.value.x - eventOrigin.x,
        y: 0.5 * containerDimensions.value.y - eventOrigin.y,
      };
    }

    return panDirection;
  });

  if (alpha === AlphaMode.RelativeToZoom) {
    alpha = Math.abs(prevZoom - zoom.value);
  }
  if (alpha < 0) alpha = 0;
  if (alpha > 1) alpha = 1;

  log('eventOrigin', eventOrigin);
  log('direction vector', directionVector.value);
  log("alpha", alpha);

  log('containerDimensions', containerDimensions.value);
  log('transformDimensions', transformDimensions.value);


  currentPan = {
    x: currentPan.x + alpha * directionVector.value.x + panAdditionalDirection.x,
    y: currentPan.y + alpha * directionVector.value.y + panAdditionalDirection.y,
  };

  pan.value = currentPan;

  log("end", undefined);
}

// support touch
onMounted(() => {
  let movingEvId = new Set();
  let evCache = new Array();
  let prevDiff = -1;
  const pointerToPrevPointer: Record<number, any> = {};

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

    console.log(s, ev);
  }

  function remove_event(ev: PointerEvent) {
    delete pointerToPrevPointer[ev.pointerId];

    for (var i = 0; i < evCache.length; i++) {
      if (evCache[i].pointerId == ev.pointerId) {
        evCache.splice(i, 1);
        break;
      }
    }
  }

  function pointerdown_handler(ev: PointerEvent) {
    evCache.push(ev);
    pointerToPrevPointer[ev.pointerId] = {
      x: ev.clientX,
      y: ev.clientY,
    };
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
    let previousEvent = undefined;
    for (var i = 0; i < evCache.length; i++) {
      if (ev.pointerId == evCache[i].pointerId) {
        previousEvent = evCache[i];
        evCache[i] = ev;
        break;
      }
    }

    if (previousEvent == undefined) {
      return;
    }

    log('pointerMove', ev);


    previousEvent as PointerEvent

    movingEvId.add(ev.pointerId);
    dragging.value = true;

    // zoom (two fingers are touching)
    if (evCache.length == 2) {
      if (!props.zoomEnabled) return;

      const a1 = evCache[0];
      const b1 = evCache[1];

      const a2 = pointerToPrevPointer[a1.pointerId];
      const b2 = pointerToPrevPointer[b1.pointerId];

      const deltaPanFromPan = {
        x: ((a2.clientX - a1.clientX) + (b2.clientX - b1.clientX)) / 2,
        y: ((a2.clientY - a1.clientY) + (b2.clientY - b1.clientY)) / 2,
      };

      pointerToPrevPointer[a1.pointerId] = a1;
      pointerToPrevPointer[b1.pointerId] = b1;

      // Calculate the distance between the two pointers
      var curDiff = Math.sqrt(
        Math.pow(b1.x - a1.x, 2) +
        Math.pow(b1.y - a1.y, 2),
      );

      if (prevDiff > 0) {
        const deltaZoom = props.zoomStep * (curDiff - prevDiff) * 0.025;
        const transformDimensionsBefore = { ...transformDimensions.value };

        zoom.value = checkZoomBounds(zoom.value + deltaZoom);

        const deltaPanFromZoom = {
          x: (transformDimensionsBefore.x - transformDimensions.value.x) / 2,
          y: (transformDimensionsBefore.x - transformDimensions.value.x) / 2,
        };

        pan.value = {
          x: pan.value.x + deltaPanFromZoom.x - deltaPanFromPan.x,
          y: pan.value.y + deltaPanFromZoom.y - deltaPanFromPan.y,
        };
      }

      // Cache the distance for the next move event
      prevDiff = curDiff;
    }

    // pan (only one finger is touching)
    else if (evCache.length == 1) {
      const deltaPan = {
        x: ev.clientX - previousEvent.clientX,
        y: ev.clientY - previousEvent.clientY
      }

      pan.value = {
        x: pan.value.x + deltaPan.x,
        y: pan.value.y + deltaPan.y,
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

    zoomPan({
      change: event.deltaY / Math.abs(event.deltaY),
      panDirection: PanDirectionMode.CenterMiddle,
      eventOrigin: eventPositionToVector({
        x: event.clientX,
        y: event.clientY,
      }),
      alpha: AlphaMode.RelativeToZoom,
    });
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
      zoomPan({
        change: 1,

        eventOrigin: eventPositionToVector({
          x: event.clientX,
          y: event.clientY,
        }),
        panDirection: PanDirectionMode.CenterEventOrigin,
      });
    });
  }
})

function buttonPan(direction: { x: number, y: number }) {
  pan.value = {
    x: pan.value.x + (direction.x * props.panStep),
    y: pan.value.y + (direction.y * props.panStep),
  }
}

function buttonZoom(direction: number) {
  zoomPan({ change: direction, alpha: 1, panDirection: PanDirectionMode.CenterEventOrigin });
}

function buttonHome() {
  // if (props.debug) console.clear();

  pan.value = {
    x: props.homePanX,
    y: props.homePanY,
  };

  zoom.value = props.homeZoom;
}

const panZoomHome = buttonHome;
const panUp = () => buttonPan({ x: 0, y: -1 });
const panDown = () => buttonPan({ x: 0, y: 1 });
const panLeft = () => buttonPan({ x: -1, y: 0 });
const panRight = () => buttonPan({ x: 1, y: 0 });

const zoomIn = () => buttonZoom(1);
const zoomOut = () => buttonZoom(-1);

defineExpose({
  props,
  zoom,
  pan,
  dragging,
  showOverlay,

  panZoomHome,
  panUp,
  panDown,
  panLeft,
  panRight,
  zoomIn,
  zoomOut,
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
