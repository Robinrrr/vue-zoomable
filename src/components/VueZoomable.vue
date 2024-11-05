<template>
  <div ref="container" class="container" :class="$style.container" @wheel="onWheel">
    <slot></slot>
    <ControlButtons v-if="props.enableControllButton" @button-home="button.onHome" @button-pan="button.onPan"
      @button-zoom="button.onZoom"></ControlButtons>

    <ScrollOverlay v-model="showOverlay">
      Use '{{ props.enableWheelOnKey }}' + 'scroll' to zoom.
    </ScrollOverlay>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, Ref, createApp, onMounted, watch, ModelRef } from 'vue';
import { useTouch } from "../composables/useTouch";
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


function centerElement(element: HTMLElement) {
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
  // track the keys, which are currently pressed
  document.addEventListener('keydown', (event) => { pressedKeys.add(event.key); });
  document.addEventListener('keyup', (event) => { pressedKeys.delete(event.key); });
  // track if the mouse is within the container
  container.value.addEventListener('mouseenter', () => { isInContainer.value = true });
  container.value.addEventListener('mouseleave', () => { isInContainer.value = false });

  window.addEventListener(
    'wheel',
    event => {
      if (!isInContainer.value || props.enableWheelOnKey !== "Control") return;
      if (event.ctrlKey) event.preventDefault();
    }, { passive: false },
  );
});
function onWheel(ev: WheelEvent) {
  // check if all conditions are met to scroll
  if (!props.wheelEnabled || !props.zoomEnabled) return;
  if (props.enableWheelOnKey !== undefined && !pressedKeys.has(props.enableWheelOnKey)) {
    showOverlay.value = true;
    return;
  }

  // normalizes the value of ev.deltaY to either be 1 or -1 and multiplies it with the double click zoom step?
  zoom.value += props.dblClickZoomStep * ev.deltaY / Math.abs(ev.deltaY);
}

onMounted(() => {
  useTouch(props, pan, zoom, container, dragging);
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
