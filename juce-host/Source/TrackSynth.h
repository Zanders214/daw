#pragma once

#include <JuceHeader.h>
#include <cmath>

/**
 * TrackSynth — a tiny built-in polyphonic instrument for a track: a sawtooth
 * oscillator → one-pole lowpass → ADSR, mirroring the browser's toy synth
 * (src/lib/audio.ts) so MIDI clips make sound natively without an external
 * instrument plugin. Driven by a MidiBuffer each block; output is ADDED into the
 * track's scratch buffer (so it sums with audio clips).
 */
class TrackSynth
{
public:
    TrackSynth()
    {
        synth.addSound (new SynthSound());
        for (int i = 0; i < kVoices; ++i)
            synth.addVoice (new SawVoice());
    }

    void prepare (double sampleRate)
    {
        synth.setCurrentPlaybackSampleRate (sampleRate);
    }

    /** Render `numSamples` (driven by `midi`) ADDED into `buffer`. */
    void renderInto (juce::AudioBuffer<float>& buffer, const juce::MidiBuffer& midi, int numSamples)
    {
        synth.renderNextBlock (buffer, midi, 0, numSamples);
    }

    /** Silence every voice immediately (seek / loop / pause). */
    void panic()
    {
        synth.allNotesOff (0, false);
    }

private:
    static constexpr int kVoices = 16;

    struct SynthSound : public juce::SynthesiserSound
    {
        bool appliesToNote (int) override { return true; }
        bool appliesToChannel (int) override { return true; }
    };

    /** Sawtooth → one-pole lowpass (~3.5 kHz) → ADSR, matching the web synth. */
    struct SawVoice : public juce::SynthesiserVoice
    {
        bool canPlaySound (juce::SynthesiserSound* s) override
        {
            return dynamic_cast<SynthSound*> (s) != nullptr;
        }

        void startNote (int midiNoteNumber, float velocity,
                        juce::SynthesiserSound*, int /*pitchWheel*/) override
        {
            phase = 0.0;
            phaseInc = juce::MidiMessage::getMidiNoteInHertz (midiNoteNumber) / getSampleRate();
            level = juce::jlimit (0.0f, 1.0f, velocity);
            lpState = 0.0f;
            adsr.setSampleRate (getSampleRate());
            adsr.setParameters ({ 0.005f, 0.12f, 0.8f, 0.12f }); // attack/decay/sustain/release
            adsr.noteOn();
        }

        void stopNote (float /*velocity*/, bool allowTailOff) override
        {
            if (allowTailOff)
            {
                adsr.noteOff();
            }
            else
            {
                adsr.reset();
                clearCurrentNote();
            }
        }

        void pitchWheelMoved (int) override { /* no-op: this toy synth ignores pitch-bend */ }
        void controllerMoved (int, int) override { /* no-op: this toy synth ignores MIDI CCs */ }

        using juce::SynthesiserVoice::renderNextBlock; // keep the double overload visible

        void renderNextBlock (juce::AudioBuffer<float>& out, int startSample, int numSamples) override
        {
            if (! adsr.isActive())
                return;

            // one-pole lowpass coefficient for ~3.5 kHz (matches audio.ts).
            const double cutoff = 3500.0;
            const auto a = (float) std::exp (-2.0 * juce::MathConstants<double>::pi * cutoff / getSampleRate());

            for (int n = 0; n < numSamples; ++n)
            {
                const auto saw = (float) (2.0 * phase - 1.0); // naive saw in [-1,1]
                phase += phaseInc;
                if (phase >= 1.0) phase -= 1.0;

                lpState = (1.0f - a) * saw + a * lpState;
                const float s = lpState * adsr.getNextSample() * level * 0.22f; // 0.22 ~ web peak

                for (int ch = 0; ch < out.getNumChannels(); ++ch)
                {
                    out.addSample (ch, startSample + n, s);
                }

                if (! adsr.isActive())
                {
                    clearCurrentNote();
                    break;
                }
            }
        }

    private:
        double phase { 0.0 };
        double phaseInc { 0.0 };
        float level { 0.0f };
        float lpState { 0.0f };
        juce::ADSR adsr;
    };

    juce::Synthesiser synth;
};
