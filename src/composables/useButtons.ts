import { Ref } from "vue";
import { useMove } from "./move";

interface PanDirection {
    x: number;
    y: number;
}

export function useButtons(
    props: any,
    pan: Ref<{ x: number, y: number }>,
    zoom: Ref<number>,
    setOverlay: Function) {


    const eventType: string = "controll_button";

    let isHolding = false;

    function holding(callback: Function, delay: number) {
        if (!isHolding) return;

        callback();
        setTimeout(() => { holding(callback, delay) }, delay)
    }

    function onPan(direction: PanDirection, usingHold: boolean = false) {
        pan.value = {
            x: pan.value.x + direction.x * props.buttonPanStep,
            y: pan.value.y + direction.y * props.buttonPanStep
        }

        isHolding = usingHold;
        if (isHolding) {
            setTimeout(() => {
                holding(() => {
                    pan.value = {
                        x: pan.value.x + direction.x * props.buttonPanStep * 0.5,
                        y: pan.value.y + direction.y * props.buttonPanStep * 0.5
                    }
                }, 50)
            }, 300);
        }
    }

    function onZoom(direction: number, usingHold: boolean = false) {
        zoom.value += direction * props.buttonZoomStep

        isHolding = usingHold;
        if (isHolding) {
            setTimeout(() => {
                holding(() => {
                    zoom.value += direction * props.buttonZoomStep * 0.5;

                }, 50)
            }, 300);
        }
    }

    function onHome() {
        // what a totally necesarry function *rolls eyes*
        zoom.value = props.initialZoom;
        pan.value = {
            x: props.initialPanX,
            y: props.initialPanY,
        }
    }

    return {
        onPan,
        onZoom,
        onHome,
    }
}
