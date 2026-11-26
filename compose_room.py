"""Render the original looping Ribbon Atelier music box arrangement."""
import argparse
from array import array
from math import exp, pi, sin, sqrt
from pathlib import Path
import shutil
import subprocess
import tempfile
import wave

SAMPLE_RATE = 24000
BEAT = 0.6
BAR = BEAT * 4
MELODY = [
    [(0, 78, 1.5), (1.5, 81, .5), (2, 83, 1), (3, 81, 1)],
    [(0, 76, 1.5), (1.5, 78, .5), (2, 69, 2)],
    [(0, 74, 1), (1, 78, 1), (2, 81, 1.5), (3.5, 78, .5)],
    [(0, 79, 1.5), (1.5, 78, .5), (2, 76, 2)],
    [(0, 74, 1), (.95, 76, 1), (2, 78, 1.5), (3.5, 81, .5)],
    [(0, 83, 1.5), (1.5, 85, .5), (2, 81, 2)],
    [(0, 86, 1.5), (1.5, 85, .5), (2, 83, 1), (3, 78, 1)],
    [(0, 76, 1), (1, 73, 1), (2, 69, 2)],
    [(0, 78, 1.5), (1.5, 81, .5), (2, 86, 1), (3, 85, 1)],
    [(0, 83, 1.5), (1.5, 81, .5), (2, 76, 2)],
    [(0, 74, 1), (1, 78, 1), (2, 81, 1.5), (3.5, 83, .5)],
    [(0, 79, 1.5), (1.5, 78, .5), (2, 76, 2)],
    [(0, 74, 1.5), (1.5, 76, .5), (2, 78, 2)],
    [(0, 81, 1.5), (1.5, 83, .5), (2, 85, 1.5), (3.5, 81, .5)],
    [(0, 78, 1.5), (1.5, 76, .5), (2, 74, 2)],
    [(0, 69, 1.5), (2, 73, 1), (3, 76, 1)],
]
CHORDS = [
    (50, 57, 62, 66), (45, 57, 61, 64), (47, 54, 62, 66), (43, 55, 59, 62),
    (47, 55, 62, 66), (45, 57, 61, 64), (47, 54, 59, 66), (45, 55, 61, 64),
    (50, 57, 62, 66), (49, 57, 61, 64), (47, 54, 62, 66), (43, 55, 59, 62),
    (52, 55, 59, 66), (45, 57, 61, 64), (50, 57, 62, 66), (45, 55, 61, 64),
]


def pluck(track, midi, when, length, gain, pan):
    sample_count = len(track[0])
    start = round(when * SAMPLE_RATE)
    frequency = 440 * 2 ** ((midi - 69) / 12)
    decay = max(.22, length * .63)
    left = sqrt((1 - pan) / 2)
    right = sqrt((1 + pan) / 2)
    for i in range(round(min(2.4, length + .72) * SAMPLE_RATE)):
        t = i / SAMPLE_RATE
        theta = 2 * pi * frequency * t
        envelope = (1 - exp(-t * 370)) * exp(-t / decay)
        tone = sin(theta) + .29 * sin(theta * 2.002) * exp(-7 * t)
        tone += .11 * sin(theta * 3.997) * exp(-13 * t) + .055 * sin(theta * 6.065) * exp(-30 * t)
        sample = gain * tone * envelope
        index = (start + i) % sample_count
        track[0][index] += sample * left
        track[1][index] += sample * right


def score():
    size = round(SAMPLE_RATE * BAR * len(MELODY))
    track = [array("f", [0]) * size, array("f", [0]) * size]
    for measure, (melody, chord) in enumerate(zip(MELODY, CHORDS)):
        start = measure * BAR
        for index, (offset, pitch, length) in enumerate(melody):
            pluck(track, pitch, start + offset * BEAT + (index % 2) * .011, length * BEAT,
                  .115 if index == 0 else .089, .17)
        for index, pitch in enumerate((chord[0], chord[1], chord[2], chord[1], chord[3], chord[1])):
            pluck(track, pitch, start + index * .64 * BEAT, .64, .049 if index == 0 else .029, -.28)
    echo = [(round(SAMPLE_RATE * seconds), gain) for seconds, gain in [(.108, .12), (.219, .075), (.337, .045)]]
    data = array("h")
    for i in range(size):
        for channel in range(2):
            value = track[channel][i] + sum(track[(channel + j + 1) % 2][(i - delay) % size] * gain
                                           for j, (delay, gain) in enumerate(echo))
            data.append(round(max(-1, min(1, value * 2.6)) * 32767))
    return data


def render(output):
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is required to render the Ogg asset.")
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "room.wav"
        with wave.open(str(source), "wb") as handle:
            handle.setparams((2, 2, SAMPLE_RATE, 0, "NONE", "not compressed"))
            handle.writeframes(score().tobytes())
        subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(source),
                        "-c:a", "libvorbis", "-q:a", "2.5", str(output)], check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path, nargs="?", default=Path(__file__).parent / "assets" / "music-room.ogg")
    render(parser.parse_args().output)
