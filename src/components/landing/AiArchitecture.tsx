"use client";

import React from "react";
import { IconCheck } from "@tabler/icons-react";

const checks = [
  "Transcription in English and Urdu with speaker labels.",
  "Semantic search over every meeting using pgvector embeddings.",
  "Runs entirely on free-tier AI, no enterprise contract required.",
];

const stack = ["Gemini", "Groq", "Supabase pgvector", "Stream", "Clerk"];

const AiArchitecture = () => {
  return (
    <section className="bg-surface py-24 border-t border-outline-variant">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          {/* Left — text */}
          <div className="lg:w-1/2">
            <h2 className="text-3xl md:text-4xl font-bold text-on-surface mb-6">
              Built on a modern, private AI stack
            </h2>
            <p className="text-on-surface-variant text-lg mb-6 leading-relaxed">
              NeuraMeet runs on Gemini and Groq for transcription and
              summarization, with Supabase pgvector powering semantic search
              across your meetings. Your data stays in your own Supabase
              project, no proprietary model is trained on your calls.
            </p>
            <ul className="space-y-4">
              {checks.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <IconCheck
                    size={20}
                    className="text-primary-container mt-0.5 flex-shrink-0"
                    stroke={2}
                  />
                  <span className="text-on-surface-variant text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — powered-by card */}
          <div className="lg:w-1/2 w-full">
            <div className="bg-surface-container-lowest rounded-xl p-8 border border-outline-variant h-80 flex flex-col justify-center items-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary-container/15 rounded-full" />
              <div className="text-center z-10">
                <div className="text-sm font-semibold text-on-surface-variant mb-6">
                  Powered by
                </div>
                <div className="flex flex-wrap justify-center gap-3 max-w-sm">
                  {stack.map((name) => (
                    <span
                      key={name}
                      className="bg-primary-container/10 text-primary-container rounded-full px-3 py-1 text-sm"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AiArchitecture;
