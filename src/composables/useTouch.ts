import { Ref, ModelRef } from "vue";


export function useTouch(
    props: any,
    pan: Ref<{ x: number, y: number }>,
    zoom: Ref<number>,
    container: Ref<HTMLElement>,
		dragging: ModelRef<boolean>,
) {
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
				let zoomT = zoom.value;

				zoomT += (curDiff - prevDiff) * 0.01;
				if (zoomT < props.minZoom) zoomT = props.minZoom;
				if (zoomT > props.maxZoom) zoomT = props.maxZoom;

				zoom.value = zoomT;

				if (curDiff > prevDiff) {
					// The distance between the two pointers has increased
					log('Pinch moving OUT -> Zoom in', ev);
				}
				if (curDiff < prevDiff) {
					// The distance between the two pointers has decreased
					log('Pinch moving IN -> Zoom out', ev);
				}
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
}