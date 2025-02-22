import React, { FC, memo, useEffect, useState } from 'react';
import { useSimVar } from '@instruments/common/simVars';
import { Layer, getSmallestAngle } from '@instruments/common/utils';
import { MathUtils } from '@shared/MathUtils';
import { EfisNdMode, EfisSide, NdSymbol } from '@shared/NavigationDisplay';
import { ArmedLateralMode, isArmed, LateralMode } from '@shared/autopilot';
import { useArinc429Var } from '@instruments/common/arinc429';
import { TopMessages } from '../elements/TopMessages';
import { ToWaypointIndicator } from '../elements/ToWaypointIndicator';
import { FlightPlan } from '../elements/FlightPlan';
import { MapParameters } from '../utils/MapParameters';
import { RadioNeedle } from '../elements/RadioNeedles';
import { CrossTrack } from '../elements/CrossTrack';
import { TrackLine } from '../elements/TrackLine';
import { Traffic } from '../elements/Traffic';

export interface RoseModeProps {
    symbols: NdSymbol[],
    adirsAlign: boolean,
    rangeSetting: number,
    mode: EfisNdMode.ROSE_ILS | EfisNdMode.ROSE_VOR | EfisNdMode.ROSE_NAV,
    side: EfisSide,
    ppos: LatLongData,
    mapHidden: boolean,
    trueRef: boolean,
}

export const RoseMode: FC<RoseModeProps> = ({ symbols, adirsAlign, rangeSetting, mode, side, ppos, mapHidden, trueRef }) => {
    const magHeading = useArinc429Var('L:A32NX_ADIRS_IR_1_HEADING');
    const magTrack = useArinc429Var('L:A32NX_ADIRS_IR_1_TRACK');
    const trueHeading = useArinc429Var('L:A32NX_ADIRS_IR_1_TRUE_HEADING');
    const trueTrack = useArinc429Var('L:A32NX_ADIRS_IR_1_TRUE_TRACK');
    const [tcasMode] = useSimVar('L:A32NX_SWITCH_TCAS_Position', 'number');
    const [selectedHeading] = useSimVar('L:A32NX_FCU_HEADING_SELECTED', 'degrees');
    const [lsCourse] = useSimVar('L:A32NX_FM_LS_COURSE', 'number');
    const [lsDisplayed] = useSimVar(`L:BTN_LS_${side === 'L' ? 1 : 2}_FILTER_ACTIVE`, 'bool'); // TODO rename simvar
    const [fmaLatMode] = useSimVar('L:A32NX_FMA_LATERAL_MODE', 'enum', 200);
    const [armedLateralBitmask] = useSimVar('L:A32NX_FMA_LATERAL_ARMED', 'enum', 200);
    const [groundSpeed] = useSimVar('GPS GROUND SPEED', 'Meters per second', 200);

    const heading = Number(MathUtils.fastToFixed((trueRef ? trueHeading.value : magHeading.value), 2));
    const track = Number(MathUtils.fastToFixed((trueRef ? trueTrack.value : magTrack.value), 2));

    const [mapParams] = useState(() => {
        const params = new MapParameters();
        params.compute(ppos, 0, rangeSetting / 2, 250, trueHeading.value);

        return params;
    });

    useEffect(() => {
        mapParams.compute(ppos, 0, rangeSetting / 2, 250, trueHeading.value);
    }, [ppos.lat, ppos.long, trueHeading.value, rangeSetting].map((n) => MathUtils.fastToFixed(n, 6)));

    if (adirsAlign) {
        return (
            <>
                <Overlay
                    heading={heading}
                    rangeSetting={rangeSetting}
                    tcasMode={tcasMode}
                />
                <g id="map" clipPath="url(#rose-mode-map-clip)">
                    { mode === EfisNdMode.ROSE_NAV && (
                        <g visibility={mapHidden ? 'hidden' : 'visible'}>
                            <FlightPlan
                                x={384}
                                y={384}
                                side={side}
                                range={rangeSetting}
                                symbols={symbols}
                                mapParams={mapParams}
                                mapParamsVersion={mapParams.version}
                                debug={false}
                            />

                            { ((fmaLatMode === LateralMode.NONE || fmaLatMode === LateralMode.HDG || fmaLatMode === LateralMode.TRACK)
                                && !isArmed(armedLateralBitmask, ArmedLateralMode.NAV)) && (
                                <TrackLine x={384} y={384} heading={heading} track={track} mapParams={mapParams} groundSpeed={groundSpeed} symbols={symbols} ndRange={rangeSetting} />
                            )}
                        </g>
                    )}
                    <RadioNeedle index={1} side={side} displayMode={mode} centreHeight={384} trueRef={trueRef} />
                    <RadioNeedle index={2} side={side} displayMode={mode} centreHeight={384} trueRef={trueRef} />
                </g>

                { mode === EfisNdMode.ROSE_VOR && <VorCaptureOverlay heading={heading} side={side} /> }

                { mode === EfisNdMode.ROSE_ILS && <IlsCaptureOverlay heading={heading} side={side} /> }

                { mode === EfisNdMode.ROSE_NAV && <ToWaypointIndicator side={side} trueRef={trueRef} /> }
                { mode === EfisNdMode.ROSE_VOR && <VorInfo side={side} /> }
                { mode === EfisNdMode.ROSE_ILS && <IlsInfo side={side} /> }

                <TopMessages side={side} ppos={ppos} trueTrack={trueTrack} trueRef={trueRef} />
                <TrackBug heading={heading} track={track} />
                { mode === EfisNdMode.ROSE_NAV && lsDisplayed && <LsCourseBug heading={heading} lsCourse={lsCourse} /> }
                <SelectedHeadingBug heading={heading} selected={selectedHeading} />
                { mode === EfisNdMode.ROSE_ILS && <GlideSlope /> }
                <Plane />
                {mode === EfisNdMode.ROSE_NAV && <CrossTrack x={390} y={407} side={side} />}
                <g clipPath="url(#rose-mode-tcas-clip)">
                    <Traffic mode={mode} mapParams={mapParams} />
                </g>
            </>
        );
    }
    return (
        <>
            <MapFailOverlay rangeSetting={rangeSetting} />

            <text x={681} y={28} fontSize={25} className="White" textAnchor="end">PPOS</text>
        </>
    );
};

interface OverlayProps {
    heading: number,
    rangeSetting: number,
    tcasMode: number,
}

const Overlay: FC<OverlayProps> = ({ heading, rangeSetting, tcasMode }) => (
    <>
        <RoseModeOverlayDefs />

        {/* C = 384,384 */}
        <g transform="rotateX(0deg)" stroke="white" strokeWidth={3} fill="none">
            <g clipPath="url(#arc-mode-overlay-clip-4)">
                <g transform={`rotate(${MathUtils.diffAngle(heading, 0)} 384 384)`}>
                    <RoseModeOverlayHeadingRing />
                </g>
            </g>
            {/* R = 125, middle range ring */}
            { (tcasMode === 0 || rangeSetting > 10)
                && (
                    <path
                        d="M 509 384 A 125 125 0 0 1 259 384 M 259 384 A 125 125 180 0 1 509 384"
                        strokeDasharray="15 10"
                        strokeDashoffset="-4.2"
                    />
                )}

            {/* middle range ring replaced with tcas range ticks */}
            { (tcasMode > 0 && rangeSetting === 10)
                && (
                    <g>
                        <line x1={384} x2={384} y1={264} y2={254} className="rounded White" transform="rotate(0 384 384)" />
                        <line x1={384} x2={384} y1={264} y2={254} className="rounded White" transform="rotate(30 384 384)" />
                        <line x1={384} x2={384} y1={264} y2={254} className="rounded White" transform="rotate(60 384 384)" />
                        <line x1={384} x2={384} y1={264} y2={254} className="rounded White" transform="rotate(90 384 384)" />
                        <line x1={384} x2={384} y1={264} y2={254} className="rounded White" transform="rotate(120 384 384)" />
                        <line x1={384} x2={384} y1={264} y2={254} className="rounded White" transform="rotate(150 384 384)" />
                        <line x1={384} x2={384} y1={264} y2={254} className="rounded White" transform="rotate(180 384 384)" />
                        <line x1={384} x2={384} y1={264} y2={254} className="rounded White" transform="rotate(210 384 384)" />
                        <line x1={384} x2={384} y1={264} y2={254} className="rounded White" transform="rotate(240 384 384)" />
                        <line x1={384} x2={384} y1={264} y2={254} className="rounded White" transform="rotate(270 384 384)" />
                        <line x1={384} x2={384} y1={264} y2={254} className="rounded White" transform="rotate(300 384 384)" />
                        <line x1={384} x2={384} y1={264} y2={254} className="rounded White" transform="rotate(330 384 384)" />
                    </g>
                )}

            {/* R = 62, tcas range ticks */}
            { (tcasMode > 0 && rangeSetting === 20)
                && (
                    <g>
                        <line x1={384} x2={384} y1={327} y2={317} className="rounded White" transform="rotate(0 384 384)" />
                        <line x1={384} x2={384} y1={327} y2={317} className="rounded White" transform="rotate(30 384 384)" />
                        <line x1={384} x2={384} y1={327} y2={317} className="rounded White" transform="rotate(60 384 384)" />
                        <line x1={384} x2={384} y1={327} y2={317} className="rounded White" transform="rotate(90 384 384)" />
                        <line x1={384} x2={384} y1={327} y2={317} className="rounded White" transform="rotate(120 384 384)" />
                        <line x1={384} x2={384} y1={327} y2={317} className="rounded White" transform="rotate(150 384 384)" />
                        <line x1={384} x2={384} y1={327} y2={317} className="rounded White" transform="rotate(180 384 384)" />
                        <line x1={384} x2={384} y1={327} y2={317} className="rounded White" transform="rotate(210 384 384)" />
                        <line x1={384} x2={384} y1={327} y2={317} className="rounded White" transform="rotate(240 384 384)" />
                        <line x1={384} x2={384} y1={327} y2={317} className="rounded White" transform="rotate(270 384 384)" />
                        <line x1={384} x2={384} y1={327} y2={317} className="rounded White" transform="rotate(300 384 384)" />
                        <line x1={384} x2={384} y1={327} y2={317} className="rounded White" transform="rotate(330 384 384)" />
                    </g>
                )}

            <text x={212} y={556} className="Cyan" fontSize={22}>{rangeSetting / 2}</text>
            <text x={310} y={474} className="Cyan" fontSize={22}>{rangeSetting / 4}</text>

            {/* fixed triangle markers every 45 deg except 12 o'clock */}
            <path d="M384,132 L379,123 L389,123 L384,132" transform="rotate(45 384 384)" fill="white" />
            <path d="M384,132 L379,123 L389,123 L384,132" transform="rotate(90 384 384)" fill="white" />
            <path d="M384,132 L379,123 L389,123 L384,132" transform="rotate(135 384 384)" fill="white" />
            <path d="M384,132 L379,123 L389,123 L384,132" transform="rotate(180 384 384)" fill="white" />
            <path d="M384,132 L379,123 L389,123 L384,132" transform="rotate(225 384 384)" fill="white" />
            <path d="M384,132 L379,123 L389,123 L384,132" transform="rotate(270 384 384)" fill="white" />
            <path d="M384,132 L379,123 L389,123 L384,132" transform="rotate(315 384 384)" fill="white" />
        </g>
    </>
);

const RoseModeOverlayDefs = memo(() => (
    <>
        <clipPath id="rose-mode-map-clip">
            <path d="M45,155 L282,155 a250,250 0 0 1 204,0 L723,155 L723,562 L648,562 L591,625 L591,768 L174,768 L174,683 L122,625 L45,625 L45,155" />
        </clipPath>
        <clipPath id="rose-mode-wx-terr-clip">
            <path d="M45,155 L282,155 a250,250 0 0 1 204,0 L723,155 L723,384 L45,384 L45,155" />
        </clipPath>
        <clipPath id="rose-mode-tcas-clip">
            <path d="M45,155 L282,155 a250,250 0 0 1 204,0 L723,155 L723,562 L648,562 L591,625 L591,768 L174,768 L174,683 L122,625 L45,625 L45,155" />
        </clipPath>
        {/* inverted map overlays for terrain map in WASM module  */}
        <path name="rose-mode-bottom-left-map-area" d="M45,625 L122,625 L174,683 L174,768 L0,768 L0,0 L45,0L45,625" className="nd-inverted-map-area" />
        <path name="rose-mode-bottom-right-map-area" d="M591,768 L591,626 L648,562 L723,562 L723,0 L768,0 L768,768 L591,769" className="nd-inverted-map-area" />
        <path name="rose-mode-top-map-area" d="M45,0 L45,155, L282,155 a250,250 0 0 1 204,0 L723,155 L723,0 L45,0" className="nd-inverted-map-area" />
    </>
));

const RoseModeOverlayHeadingRing = memo(() => (
    <>
        {/* R = 250 */}
        <circle cx={384} cy={384} r={250} />

        <g transform="rotate(0 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
            <text x={384} y={112} textAnchor="middle" fontSize={22} fill="white" stroke="none">0</text>
        </g>

        <g transform="rotate(5 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(10 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(15 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(20 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(25 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(30 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
            <text x={384} y={112} textAnchor="middle" fontSize={22} fill="white" stroke="none">3</text>
        </g>

        <g transform="rotate(35 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(40 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(45 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(50 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(55 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(60 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
            <text x={384} y={112} textAnchor="middle" fontSize={22} fill="white" stroke="none">6</text>
        </g>

        <g transform="rotate(65 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(70 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(75 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(80 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(85 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(90 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
            <text x={384} y={112} textAnchor="middle" fontSize={22} fill="white" stroke="none">9</text>
        </g>

        <g transform="rotate(95 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(100 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(105 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(110 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(115 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(120 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
            <text x={384} y={112} textAnchor="middle" fontSize={22} fill="white" stroke="none">12</text>
        </g>

        <g transform="rotate(125 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(130 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(135 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(140 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(145 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(150 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
            <text x={384} y={112} textAnchor="middle" fontSize={22} fill="white" stroke="none">15</text>
        </g>

        <g transform="rotate(155 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(160 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(165 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(170 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(175 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(180 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
            <text x={384} y={112} textAnchor="middle" fontSize={22} fill="white" stroke="none">18</text>
        </g>

        <g transform="rotate(185 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(190 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(195 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(200 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(205 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(210 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
            <text x={384} y={112} textAnchor="middle" fontSize={22} fill="white" stroke="none">21</text>
        </g>

        <g transform="rotate(215 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(220 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(225 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(230 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(235 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(240 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
            <text x={384} y={112} textAnchor="middle" fontSize={22} fill="white" stroke="none">24</text>
        </g>

        <g transform="rotate(245 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(250 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(255 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(260 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(265 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(270 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
            <text x={384} y={112} textAnchor="middle" fontSize={22} fill="white" stroke="none">27</text>
        </g>

        <g transform="rotate(275 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(280 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(285 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(290 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(295 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(300 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
            <text x={384} y={112} textAnchor="middle" fontSize={22} fill="white" stroke="none">30</text>
        </g>

        <g transform="rotate(305 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(310 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(315 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(320 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(325 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(330 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
            <text x={384} y={112} textAnchor="middle" fontSize={22} fill="white" stroke="none">33</text>
        </g>

        <g transform="rotate(335 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(340 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(345 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>

        <g transform="rotate(350 384 384)">
            <line x1={384} y1={134} x2={384} y2={122} strokeWidth={2.5} />
        </g>

        <g transform="rotate(355 384 384)">
            <line x1={384} y1={134} x2={384} y2={128} strokeWidth={2.5} />
        </g>
    </>
));

const MapFailOverlay: FC<Pick<OverlayProps, 'rangeSetting'>> = memo(({ rangeSetting }) => (
    <>
        <text className="Red" fontSize={30} textAnchor="middle" x={384} y={241}>HDG</text>
        <text className="Red" fontSize={30} textAnchor="middle" x={384} y={320.6}>MAP NOT AVAIL</text>

        <clipPath id="rose-mode-map-clip">
            <path d="M-339,-229 L-102,-229 a250,250 0 0 1 204,0 L339,-229 L339,178 L264,178 L207,241 L207,384 L-210,384 L-210,299 L-262,241 L-339,241 L-339,-229" />
        </clipPath>

        {/* C = 384,384 */}
        <g stroke="white" strokeWidth={3} fill="none">
            <g clipPath="url(#arc-mode-overlay-clip-4)">
                <g>
                    {/* R = 250 */}
                    <circle cx={384} cy={384} r={250} stroke="red" />
                </g>
            </g>
            {/* R = 125, middle range ring */}
            <path
                d="M 509 384 A 125 125 0 0 1 259 384 M 259 384 A 125 125 180 0 1 509 384"
                stroke="red"
            />
        </g>
        <text x={212} y={556} className="Cyan" fontSize={22}>{rangeSetting / 2}</text>
        <text x={310} y={474} className="Cyan" fontSize={22}>{rangeSetting / 4}</text>
    </>
));

// TODO true ref
const VorCaptureOverlay: React.FC<{
    heading: number,
    side: EfisSide,
}> = ({ heading, side }) => {
    const index = side === 'L' ? 1 : 2;
    const [course] = useSimVar(`NAV OBS:${index}`, 'degrees');
    const [vorFrequency] = useSimVar(`NAV ACTIVE FREQUENCY:${index}`, 'megahertz');
    const [courseDeviation] = useSimVar(`NAV RADIAL ERROR:${index}`, 'degrees', 20);
    const [available] = useSimVar(`NAV HAS NAV:${index}`, 'number');
    const [toward, setToward] = useState(true);
    const [cdiPx, setCdiPx] = useState(12);

    useEffect(() => {
        let cdiDegrees: number;
        if (Math.abs(courseDeviation) <= 90) {
            cdiDegrees = courseDeviation;
            setToward(true);
        } else {
            cdiDegrees = Math.sign(courseDeviation) * -Avionics.Utils.diffAngle(180, Math.abs(courseDeviation));
            setToward(false);
        }
        setCdiPx(Math.min(12, Math.max(-12, cdiDegrees)) * 74 / 5);
    }, [courseDeviation.toFixed(2)]);

    // we can't tell if the course is valid from the MSFS radio, so at least check that the frequency is
    const vorCourseValid = vorFrequency > 0;

    // FIXME vor bearing - heading when course invalid
    return (
        <g transform={`rotate(${course - heading} 384 384)`} stroke="white" strokeWidth={3} fill="none">
            <g id="vor-deviation-scale">
                <circle cx={236} cy={384} r={5} />
                <circle cx={310} cy={384} r={5} />
                <circle cx={458} cy={384} r={5} />
                <circle cx={532} cy={384} r={5} />
            </g>
            { vorCourseValid && (
                <>
                    <path
                        d="M352,256 L416,256 M384,134 L384,294 M384,474 L384,634"
                        className="rounded shadow"
                        id="vor-course-pointer-shadow"
                        strokeWidth={4.5}
                    />
                    <path
                        d="M352,256 L416,256 M384,134 L384,294 M384,474 L384,634"
                        className="rounded Cyan"
                        id="vor-course-pointer"
                        strokeWidth={4}
                    />
                </>
            )}
            { available
                && (
                    <>
                        <path
                            d="M372,322 L384,304 L396,322"
                            className="rounded shadow"
                            transform={`translate(${cdiPx}, ${toward ? 0 : 160}) rotate(${toward ? 0 : 180} 384 304)`}
                            id="vor-deviation-direction-shadow"
                            strokeWidth={4.5}
                        />
                        <path
                            d="M384,304 L384,464"
                            className="rounded shadow"
                            transform={`translate(${cdiPx}, 0)`}
                            id="vor-deviation-shadow"
                            strokeWidth={4.5}
                        />
                        <path
                            d="M372,322 L384,304 L396,322"
                            className="rounded Cyan"
                            transform={`translate(${cdiPx}, ${toward ? 0 : 160}) rotate(${toward ? 0 : 180} 384 304)`}
                            id="vor-deviation-direction"
                            strokeWidth={4}
                        />
                        <path
                            d="M384,304 L384,464"
                            className="rounded Cyan"
                            transform={`translate(${cdiPx}, 0)`}
                            id="vor-deviation"
                            strokeWidth={4}
                        />
                    </>
                )}
        </g>
    );
};

// TODO true ref
const IlsCaptureOverlay: React.FC<{
    heading: number,
    side: EfisSide,
}> = memo(({ heading, side }) => {
    const index = side === 'L' ? 2 : 1;
    const [course] = useSimVar(`NAV OBS:${index + 2}`, 'degrees');
    const [ilsFrequency] = useSimVar(`NAV ACTIVE FREQUENCY:${index + 2}`, 'megahertz');
    // FIXME this shit needs to be per-MMR
    const [courseDeviation] = useSimVar('L:A32NX_RADIO_RECEIVER_LOC_DEVIATION', 'number', 20);
    const [available] = useSimVar('L:A32NX_RADIO_RECEIVER_LOC_IS_VALID', 'number');
    const [cdiPx, setCdiPx] = useState(12);

    useEffect(() => {
        // TODO back-course
        const dots = Math.max(-2, Math.min(2, courseDeviation / 0.8));
        setCdiPx(dots * 74);
    }, [courseDeviation.toFixed(2)]);

    // we can't tell if the course is valid from the MSFS radio, so at least check that the frequency is
    const ilsCourseValid = ilsFrequency >= 108 && ilsFrequency <= 112;

    return (
        <g transform={`rotate(${course - heading} 384 384)`} stroke="white" strokeWidth={3} fill="none">
            <g id="ils-deviation-scale">
                <circle cx={236} cy={384} r={5} />
                <circle cx={310} cy={384} r={5} />
                <circle cx={458} cy={384} r={5} />
                <circle cx={532} cy={384} r={5} />
            </g>
            { ilsCourseValid && (
                <>
                    <path
                        d="M352,256 L416,256 M384,134 L384,294 M384,474 L384,634"
                        className="rounded shadow"
                        id="ils-course-pointer-shadow"
                        strokeWidth={4.5}
                    />
                    <path
                        d="M352,256 L416,256 M384,134 L384,294 M384,474 L384,634"
                        className="rounded Magenta"
                        id="ils-course-pointer"
                        strokeWidth={4}
                    />
                </>
            )}
            { available
                && (
                    <>
                        <path
                            d="M384,304 L384,464"
                            className="rounded shadow"
                            transform={`translate(${cdiPx}, 0)`}
                            id="ils-deviation-shadow"
                            strokeWidth={4.5}
                        />
                        <path
                            d="M384,304 L384,464"
                            className="rounded Magenta"
                            transform={`translate(${cdiPx}, 0)`}
                            id="ils-deviation"
                            strokeWidth={4}
                        />
                    </>
                )}
        </g>
    );
});

const Plane: React.FC = () => (
    <g>
        <line id="lubber-shadow" x1={384} y1={116} x2={384} y2={152} className="shadow" strokeWidth={5.5} strokeLinejoin="round" strokeLinecap="round" />
        <line id="lubber" x1={384} y1={116} x2={384} y2={152} className="Yellow" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
        <path id="plane-shadow" d="M 384 358 l 0 75 m -37 -49 l 74 0 m -50 36 l 26 0" className="shadow" strokeWidth={5.5} strokeLinejoin="round" strokeLinecap="round" />
        <path id="plane" d="M 384 358 l 0 75 m -37 -49 l 74 0 m -50 36 l 26 0" className="Yellow" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
    </g>
);

const TrackBug: React.FC<{heading: number, track: number}> = memo(({ heading, track }) => {
    const diff = getSmallestAngle(track, heading);
    return (
        <>
            <path
                d="M384,134 L379,143 L384,152 L389,143 L384,134"
                transform={`rotate(${diff} 384 384)`}
                className="rounded shadow"
                strokeWidth={3.5}
            />
            <path
                d="M384,134 L379,143 L384,152 L389,143 L384,134"
                transform={`rotate(${diff} 384 384)`}
                className="rounded Green"
                strokeWidth={3}
            />
        </>
    );
});

// TODO true ref
const LsCourseBug: React.FC<{heading: number, lsCourse: number}> = ({ heading, lsCourse }) => {
    if (lsCourse < 0) {
        return null;
    }

    const diff = getSmallestAngle(lsCourse, heading);
    return (
        <>
            <path
                d="M384,128 L384,96 M376,120 L392,120"
                transform={`rotate(${diff} 384 384)`}
                className="rounded shadow"
                strokeWidth={2.5}
            />
            <path
                d="M384,128 L384,96 M376,120 L392,120"
                transform={`rotate(${diff} 384 384)`}
                className="rounded Magenta"
                strokeWidth={2}
            />
        </>
    );
};

const SelectedHeadingBug: React.FC<{heading: number, selected: number}> = ({ heading, selected }) => {
    if (selected < 0) {
        return null;
    }

    const diff = getSmallestAngle(selected, heading);
    return (
        <>
            <path
                d="M380,132 L372,114 L396,114 L388,132"
                transform={`rotate(${diff} 384 384)`}
                className="rounded shadow"
                strokeWidth={3.5}
            />
            <path
                d="M380,132 L372,114 L396,114 L388,132"
                transform={`rotate(${diff} 384 384)`}
                className="rounded Cyan"
                strokeWidth={3}
            />
        </>
    );
};

const VorInfo: FC<{side: EfisSide}> = memo(({ side }) => {
    const index = side === 'R' ? 2 : 1;

    const [vorIdent] = useSimVar(`NAV IDENT:${index}`, 'string');
    const [vorFrequency] = useSimVar(`NAV ACTIVE FREQUENCY:${index}`, 'megahertz');
    const [vorCourse] = useSimVar(`NAV OBS:${index}`, 'degrees');
    const [fm1Healthy] = useSimVar('L:A32NX_FM1_HEALTHY_DISCRETE', 'boolean');
    const [fm2Healthy] = useSimVar('L:A32NX_FM2_HEALTHY_DISCRETE', 'boolean');
    const fm1NavDiscrete = useArinc429Var('L:A32NX_FM1_NAV_DISCRETE');
    const fm2NavDiscrete = useArinc429Var('L:A32NX_FM2_NAV_DISCRETE');
    const [tuningMode, setTuningMode] = useState('');

    const [freqInt, freqDecimal] = vorFrequency.toFixed(2).split('.', 2);

    useEffect(() => {
        const bitIndex = 10 + index;
        if ((!fm1Healthy && !fm2Healthy) || (!fm1NavDiscrete.isNormalOperation() && !fm2NavDiscrete.isNormalOperation())) {
            setTuningMode('R');
        } else if (fm1NavDiscrete.getBitValueOr(bitIndex, false) || fm2NavDiscrete.getBitValueOr(bitIndex, false)) {
            setTuningMode('M');
        } else {
            setTuningMode('');
        }
    }, [fm1Healthy, fm1NavDiscrete.value, fm1NavDiscrete.ssm, fm2Healthy, fm2NavDiscrete.value, fm2NavDiscrete.ssm]);

    const vorFrequencyValid = vorFrequency > 0;
    // we can't tell if the course is valid from the MSFS radio, so at least check that the frequency is
    const vorCourseValid = vorFrequencyValid;

    return (
        <Layer x={748} y={28}>
            <text x={-102} y={0} fontSize={25} className="White" textAnchor="end">
                VOR
                {index}
            </text>
            <text x={0} y={0} fontSize={25} className="White" textAnchor="end">
                {vorFrequencyValid ? freqInt : '---'}
                <tspan fontSize={20}>
                    .
                    {vorFrequencyValid ? freqDecimal : '--'}
                </tspan>
            </text>
            <text x={-56} y={30} fontSize={25} className="White" textAnchor="end">CRS</text>
            <text x={20} y={30} fontSize={25} className="Cyan" textAnchor="end">
                {vorCourseValid ? (`${Math.round(vorCourse)}`).padStart(3, '0') : '---'}
                &deg;
            </text>
            <text x={-80} y={58} fontSize={20} className="White" textAnchor="end" textDecoration="underline">{tuningMode}</text>
            <text x={0} y={60} fontSize={25} className="White" textAnchor="end">{vorIdent}</text>
        </Layer>
    );
});

const IlsInfo: FC<{side: EfisSide}> = memo(({ side }) => {
    const index = side === 'R' ? 1 : 2;

    const [ilsIdent] = useSimVar(`NAV IDENT:${index + 2}`, 'string');
    const [ilsFrequency] = useSimVar(`NAV ACTIVE FREQUENCY:${index + 2}`, 'megahertz');
    const [ilsCourse] = useSimVar(`NAV OBS:${index + 2}`, 'degrees');
    const [fm1Healthy] = useSimVar('L:A32NX_FM1_HEALTHY_DISCRETE', 'boolean');
    const [fm2Healthy] = useSimVar('L:A32NX_FM2_HEALTHY_DISCRETE', 'boolean');
    const fm1NavDiscrete = useArinc429Var('L:A32NX_FM1_NAV_DISCRETE');
    const fm2NavDiscrete = useArinc429Var('L:A32NX_FM2_NAV_DISCRETE');
    const [tuningMode, setTuningMode] = useState('');

    const [freqInt, freqDecimal] = ilsFrequency.toFixed(2).split('.', 2);

    useEffect(() => {
        const bitIndex = 14 + index;
        if ((!fm1Healthy && !fm2Healthy) || (!fm1NavDiscrete.isNormalOperation() && !fm2NavDiscrete.isNormalOperation())) {
            setTuningMode('R');
        } else if (fm1NavDiscrete.getBitValueOr(bitIndex, false) || fm2NavDiscrete.getBitValueOr(bitIndex, false)) {
            setTuningMode('M');
        } else {
            setTuningMode('');
        }
    }, [fm1Healthy, fm1NavDiscrete.value, fm1NavDiscrete.ssm, fm2Healthy, fm2NavDiscrete.value, fm2NavDiscrete.ssm]);

    const ilsFrequencyValid = ilsFrequency >= 108 && ilsFrequency <= 112;
    // we can't tell if the course is valid from the MSFS radio, so at least check that the frequency is
    const ilsCourseValid = ilsFrequencyValid;

    return (
        <Layer x={748} y={28}>
            <text x={-102} y={0} fontSize={25} className="White" textAnchor="end">
                ILS
                {index}
            </text>
            <text x={0} y={0} fontSize={25} className="Magenta" textAnchor="end">
                {ilsFrequencyValid ? freqInt : '---'}
                <tspan fontSize={20}>
                    .
                    {ilsFrequencyValid ? freqDecimal : '--'}
                </tspan>
            </text>
            <text x={-56} y={30} fontSize={25} className="White" textAnchor="end">CRS</text>
            <text x={20} y={30} fontSize={25} className="Magenta" textAnchor="end">
                {ilsCourseValid ? (`${Math.round(ilsCourse)}`).padStart(3, '0') : '---'}
                &deg;
            </text>
            <text x={-80} y={58} fontSize={20} className="White" textAnchor="end" textDecoration="underline">{tuningMode}</text>
            <text x={0} y={60} fontSize={25} className="Magenta" textAnchor="end">{ilsIdent}</text>
        </Layer>
    );
});

const GlideSlope: FC = () => {
    // TODO need some photo refs for this
    // FIXME this shit needs to be per-MMR
    const [gsDeviation] = useSimVar('L:A32NX_RADIO_RECEIVER_GS_DEVIATION', 'number');
    const [gsAvailable] = useSimVar('L:A32NX_RADIO_RECEIVER_GS_IS_VALID', 'number');

    const deviationPx = gsDeviation / 0.8 * 128;

    return (
        <>
            <Layer x={750} y={384}>
                <circle cx={0} cy={-128} r={4} strokeWidth={2.5} className="White" />
                <circle cx={0} cy={-64} r={4} strokeWidth={2.5} className="White" />
                <line x1={-12} x2={12} y1={0} y2={0} className="Yellow" strokeWidth={5} />
                <circle cx={0} cy={64} r={4} strokeWidth={2.5} className="White" />
                <circle cx={0} cy={128} r={4} strokeWidth={2.5} className="White" />
            </Layer>
            <Layer x={750} y={384}>
                <path
                    d="M10,0 L0,-16 L-10,0"
                    transform={`translate(0 ${Math.max(-128, deviationPx)})`}
                    className="rounded Magenta"
                    strokeWidth={2.5}
                    visibility={(gsAvailable && deviationPx < 128) ? 'visible' : 'hidden'}
                />
                <path
                    d="M-10,0 L0,16 L10,0"
                    transform={`translate(0 ${Math.min(128, deviationPx)})`}
                    className="rounded Magenta"
                    strokeWidth={2.5}
                    visibility={(gsAvailable && deviationPx > -128) ? 'visible' : 'hidden'}
                />
            </Layer>
        </>
    );
};
