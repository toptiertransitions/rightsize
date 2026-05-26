"use client";

import { useState } from "react";

// ─── Data types ───────────────────────────────────────────────────────────────

interface LawCard { name: string; body: string; }
interface ActionItem { label: string; description: string; }

interface SlideData {
  badge: string;
  title: string;
  body?: string;
  bullets?: string[];
  examples?: string[];
  lawCards?: LawCard[];
  actionItems?: ActionItem[];
  highlight: string;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  feedback: string;
}

interface TrainingData {
  id: "harassment" | "bystander";
  title: string;
  description: string;
  legalBasis: string;
  estimatedTime: string;
  slides: SlideData[];
  quiz: QuizQuestion[];
}

// ─── Training content ─────────────────────────────────────────────────────────

const HARASSMENT: TrainingData = {
  id: "harassment",
  title: "Illinois Harassment Prevention Training",
  description: "Annual training required for all Illinois W-2 employees under the Illinois Human Rights Act. This training covers the legal definition of sexual harassment, examples of prohibited conduct, applicable law, and your rights and responsibilities.",
  legalBasis: "Illinois Human Rights Act (820 ILCS 96/1 et seq.) — Annual training required for all employers",
  estimatedTime: "20–25 minutes",
  slides: [
    {
      badge: "Section 1 of 5 — Definition",
      title: "What is sexual harassment under Illinois law?",
      body: "The Illinois Human Rights Act defines sexual harassment as unwelcome sexual advances, requests for sexual favors, or conduct of a sexual nature that meets one or more conditions:",
      bullets: [
        "Quid pro quo: Submission to or rejection of conduct is made a term or condition of employment or used as the basis for employment decisions.",
        "Hostile work environment: Conduct substantially interferes with work performance or creates an intimidating, hostile, or offensive work environment.",
      ],
      highlight: "Harassment does not need to be reported to HR to be illegal. It can come from supervisors, coworkers, clients, or vendors — and the harasser and target can be any gender.",
    },
    {
      badge: "Section 2 of 5 — Examples",
      title: "What does unlawful harassment look like?",
      body: "Harassment takes many forms. Examples of conduct that can constitute unlawful harassment:",
      examples: [
        "Commenting on someone's body or appearance in a sexual way",
        "Sending explicit or sexual messages, images, or jokes",
        "Asking personal questions about someone's sex life or relationships",
        "Touching someone without consent — hugging, patting, blocking movement",
        "Offering job benefits in exchange for sexual favors",
        "Making derogatory comments about someone based on gender or sexual orientation",
      ],
      highlight: "A single severe incident (such as physical assault) can constitute harassment. Repeated mild incidents that create a hostile environment also qualify. Intent does not matter — impact does.",
    },
    {
      badge: "Section 3 of 5 — The Law",
      title: "Federal and state law summary",
      body: "Multiple laws protect employees from sexual harassment:",
      lawCards: [
        { name: "Illinois Human Rights Act (IHRA)", body: "Illinois state law. Covers all employers with one or more employees. Prohibits sexual harassment and requires annual training. Enforced by the Illinois Department of Human Rights (IDHR)." },
        { name: "Title VII of the Civil Rights Act", body: "Federal law. Covers employers with 15 or more employees. Prohibits discrimination and harassment based on sex. Enforced by the EEOC." },
        { name: "Chicago Human Rights Ordinance", body: "Chicago city law. Covers employers with one or more employees. Adds additional protections and requires bystander intervention training annually." },
      ],
      highlight: "Under Illinois law, employers are strictly liable for supervisor harassment that results in a tangible employment action. For coworker harassment, employers are liable if they knew or should have known and failed to act.",
    },
    {
      badge: "Section 4 of 5 — Remedies",
      title: "What can victims do? What remedies are available?",
      actionItems: [
        { label: "Internal reporting", description: "Report to your supervisor, HR, or any manager. Retaliation for reporting is illegal." },
        { label: "IDHR complaint", description: "File a charge with the Illinois Department of Human Rights within 300 days of the incident. Free, no attorney required." },
        { label: "EEOC complaint", description: "File with the federal Equal Employment Opportunity Commission. Charges must typically be filed within 180–300 days." },
        { label: "Civil lawsuit", description: "After exhausting administrative remedies, employees may sue for back pay, compensatory damages, and in some cases punitive damages." },
      ],
      highlight: "Retaliation against an employee for reporting harassment, participating in an investigation, or filing a complaint is itself an unlawful employment practice under both Illinois and federal law.",
    },
    {
      badge: "Section 5 of 5 — Employer Responsibilities",
      title: "What employers must do",
      body: "Top Tier Transitions LLC is committed to maintaining a harassment-free workplace. As an employer, we are legally required to:",
      bullets: [
        "Provide annual sexual harassment prevention training to all employees",
        "Maintain a written anti-harassment policy and distribute it to all employees",
        "Promptly investigate all complaints of harassment",
        "Take immediate corrective action when harassment is found",
        "Keep all complaint records for a minimum of 5 years",
        "Never retaliate against any employee for reporting or participating in an investigation",
      ],
      highlight: "All employees are required to report harassment they witness or experience. You can report to any supervisor or manager. Confidentiality is maintained to the extent possible.",
    },
  ],
  quiz: [
    {
      question: "Under Illinois law, how many employees must a company have before the harassment prevention training requirement applies?",
      options: ["At least 15 employees", "At least 50 employees", "Just one employee", "Only full-time employees count"],
      correctIndex: 2,
      feedback: "The Illinois Human Rights Act covers employers with one or more employees — there is no minimum threshold. This is stricter than federal Title VII, which only covers employers with 15 or more employees.",
    },
    {
      question: "A coworker sends you a sexually explicit joke via text on a personal phone. Can this constitute workplace sexual harassment?",
      options: ["No — it happened on a personal device, not company property", "No — jokes are not considered harassment", "Yes — harassment can occur via any communication channel including personal devices", "Only if it happens more than three times"],
      correctIndex: 2,
      feedback: "Harassment is defined by its impact, not the medium. Texts, emails, social media messages, and in-person conduct can all constitute harassment regardless of whether company equipment was used.",
    },
    {
      question: "An employee reports a harassment complaint against their supervisor. The supervisor then reassigns the employee to less desirable shifts. What has occurred?",
      options: ["Standard management discretion — supervisors can manage scheduling", "Retaliation, which is a separate unlawful employment practice", "A minor workplace issue that HR should note but take no action on", "Nothing illegal, since no harassment was proven yet"],
      correctIndex: 1,
      feedback: "Retaliation — any adverse action taken against an employee for reporting harassment or participating in an investigation — is itself an unlawful employment practice under both Illinois and federal law, regardless of whether the original complaint is substantiated.",
    },
    {
      question: "How long does an employee in Illinois generally have to file a charge with the IDHR after a harassment incident?",
      options: ["30 days", "90 days", "300 days", "2 years"],
      correctIndex: 2,
      feedback: "Illinois employees generally have 300 days from the date of the discriminatory act to file a charge with the IDHR. Missing this deadline can waive your right to pursue an IDHR complaint, so prompt action is important.",
    },
  ],
};

const BYSTANDER: TrainingData = {
  id: "bystander",
  title: "Chicago Bystander Intervention Training",
  description: "Annual training required for all employees who work in Chicago or supervise others who work in Chicago, under the Chicago Sexual Harassment Ordinance. This training teaches you how to safely recognize and respond to harassment you witness.",
  legalBasis: "Chicago Sexual Harassment Ordinance (effective 2022) — Annual training required for Chicago-based employees",
  estimatedTime: "15–20 minutes",
  slides: [
    {
      badge: "Section 1 of 4 — Overview",
      title: "Chicago's bystander intervention requirement",
      body: "Chicago's Sexual Harassment Ordinance (effective 2022) requires all employees who work in Chicago to receive annual bystander intervention training. This training teaches you how to recognize and safely intervene when you witness harassment.",
      highlight: "This training is required annually for all employees who work in Chicago or supervise others who work in Chicago. It must be provided by the employer at no cost to the employee.",
    },
    {
      badge: "Section 2 of 4 — Strategies",
      title: "Five strategies for effective bystander intervention",
      actionItems: [
        { label: "Direct", description: "If safe to do so, address the behavior directly: \"That comment isn't appropriate\" or check in with the target: \"Are you okay?\"" },
        { label: "Distract", description: "Change the subject, interrupt the interaction, or create a distraction to stop the harassment without direct confrontation." },
        { label: "Delegate", description: "Get help from someone with more authority — a manager, HR, or security. You don't have to handle it alone." },
        { label: "Delay", description: "If you can't act in the moment, check in with the target afterward. \"I saw what happened — are you okay? Do you want to report it?\"" },
        { label: "Document", description: "If safe and appropriate, document what you witnessed (notes, time, location) to support the target if they choose to report." },
      ],
      highlight: "Never put yourself in physical danger to intervene. When direct action is not safe, use Delegate or Delay. Any intervention is better than none.",
    },
    {
      badge: "Section 3 of 4 — Recognition",
      title: "Recognizing situations that call for intervention",
      body: "As a bystander, you may witness harassment involving a coworker, client, or vendor. Signs that intervention may be appropriate:",
      bullets: [
        "Someone appears visibly uncomfortable, anxious, or is trying to leave a situation",
        "A person is being touched without consent or their personal space is being invaded",
        "Sexual or degrading comments are being made about a person's body, gender, or appearance",
        "A person is being pressured, followed, or cornered",
        "The power dynamic is unequal (supervisor/subordinate) and the behavior seems unwelcome",
      ],
      highlight: "Trust your instincts. If something feels wrong, it probably is. You don't need to be 100% certain that harassment is occurring to ask someone if they're okay.",
    },
    {
      badge: "Section 4 of 4 — Your Rights",
      title: "You are legally protected when you intervene",
      body: "Illinois and Chicago law both protect bystanders who report or intervene in good faith:",
      lawCards: [
        { name: "Anti-Retaliation Protection", body: "It is illegal for an employer to retaliate against any employee who reports harassment they witnessed, participates in an investigation, or intervenes to stop harassment." },
        { name: "Good Faith Standard", body: "You are protected when you act in good faith, even if the situation turns out not to meet the legal definition of harassment. You will not be penalized for reporting a concern." },
        { name: "Confidentiality", body: "Reports of witnessed harassment are treated with the same confidentiality as direct complaints. Your identity will be protected to the maximum extent possible." },
      ],
      highlight: "Retaliation against a bystander who reports or intervenes is itself an unlawful employment practice. If you experience retaliation, report it immediately to HR or the IDHR.",
    },
  ],
  quiz: [
    {
      question: "Under Chicago's Bystander Intervention ordinance, who is required to complete this training?",
      options: ["Only managers and supervisors", "Only employees who have personally witnessed harassment", "All employees who work in Chicago or supervise others who work in Chicago", "Only full-time employees working downtown"],
      correctIndex: 2,
      feedback: "Chicago's ordinance requires annual bystander intervention training for all employees who work in Chicago city limits or who supervise others who work in Chicago — regardless of their position or hours worked.",
    },
    {
      question: "You witness a coworker being made visibly uncomfortable by repeated unwanted comments from a client. You're not sure if it legally qualifies as harassment. What should you do?",
      options: ["Do nothing — it's not your business and you're not certain it's harassment", "Wait until it's clearly harassment before saying anything", "Check in with your coworker afterward and ask if they're okay or want to report it", "Only intervene if your manager tells you to"],
      correctIndex: 2,
      feedback: "You don't need to be certain that harassment is occurring to act. Checking in with the target after the fact is a valid and protected form of bystander intervention. Trust your instincts — if something feels wrong, act.",
    },
    {
      question: "Which of the following is NOT a recognized bystander intervention strategy?",
      options: ["Distracting the harasser to break up the interaction", "Documenting what you witnessed to support the target", "Ignoring the situation to avoid getting involved", "Delegating to a manager or HR if you can't intervene directly"],
      correctIndex: 2,
      feedback: "Ignoring the situation is never a bystander intervention strategy. Chicago's ordinance encourages all employees to act when they witness harassment. Even a small action — a check-in, a distraction, a report to HR — can make a significant difference for the target.",
    },
  ],
};

// ─── Progress state ───────────────────────────────────────────────────────────

interface QuizState { selected: number | null; answered: boolean; }

interface Progress {
  stage: "intro" | "slides" | "quiz" | "certificate";
  slideIndex: number;
  quiz: QuizState[];
  quizIndex: number;
  includesChicago: boolean;
  submitted: boolean;
  submitting: boolean;
  error: string | null;
}

function makeProgress(quizLen: number): Progress {
  return {
    stage: "intro",
    slideIndex: 0,
    quiz: Array.from({ length: quizLen }, () => ({ selected: null, answered: false })),
    quizIndex: 0,
    includesChicago: false,
    submitted: false,
    submitting: false,
    error: null,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { userName: string; userEmail: string; }

export function TrainingClient({ userName, userEmail }: Props) {
  const [activeTab, setActiveTab] = useState<"harassment" | "bystander">("harassment");
  const [harassmentProgress, setHarassmentProgress] = useState<Progress>(() => makeProgress(HARASSMENT.quiz.length));
  const [bystanderProgress, setBystanderProgress] = useState<Progress>(() => makeProgress(BYSTANDER.quiz.length));

  const training = activeTab === "harassment" ? HARASSMENT : BYSTANDER;
  const progress = activeTab === "harassment" ? harassmentProgress : bystanderProgress;
  const setProgress = activeTab === "harassment" ? setHarassmentProgress : setBystanderProgress;

  function switchTab(tab: "harassment" | "bystander") {
    setActiveTab(tab);
  }

  // ── Certificate submission ─────────────────────────────────────────────────

  async function handleSubmit() {
    setProgress(p => ({ ...p, submitting: true, error: null }));
    try {
      const correct = progress.quiz.filter((q, i) => q.answered && q.selected === training.quiz[i].correctIndex).length;
      const res = await fetch("/api/training/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainingType: training.id,
          score: correct,
          totalQuestions: training.quiz.length,
          includesChicago: training.id === "bystander" ? true : progress.includesChicago,
        }),
      });
      if (!res.ok) throw new Error("Server error");
      setProgress(p => ({ ...p, submitting: false, submitted: true }));
    } catch {
      setProgress(p => ({ ...p, submitting: false, error: "Something went wrong. Please try again." }));
    }
  }

  // ── Slide rendering ────────────────────────────────────────────────────────

  function renderSlideContent(slide: SlideData) {
    return (
      <div className="space-y-5">
        <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-[#f0f4f0] text-[#2d4a3e] border border-[#2d4a3e]/20">
          {slide.badge}
        </span>
        <h2 className="text-xl font-bold text-gray-900 leading-snug">{slide.title}</h2>

        {slide.body && (
          <p className="text-gray-700 leading-relaxed">{slide.body}</p>
        )}

        {slide.bullets && (
          <ul className="space-y-2">
            {slide.bullets.map((b, i) => (
              <li key={i} className="flex gap-3 text-gray-700 leading-relaxed">
                <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-[#2d4a3e]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        {slide.examples && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {slide.examples.map((ex, i) => (
              <div key={i} className="flex gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200">
                <span className="flex-shrink-0 mt-0.5 text-red-500">
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                </span>
                <span className="text-sm text-red-800 leading-relaxed">{ex}</span>
              </div>
            ))}
          </div>
        )}

        {slide.lawCards && (
          <div className="space-y-3">
            {slide.lawCards.map((lc, i) => (
              <div key={i} className="p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
                <p className="text-sm font-semibold text-[#2d4a3e] mb-1">{lc.name}</p>
                <p className="text-sm text-gray-600 leading-relaxed">{lc.body}</p>
              </div>
            ))}
          </div>
        )}

        {slide.actionItems && (
          <div className="space-y-3">
            {slide.actionItems.map((item, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-lg bg-white border border-gray-200">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#2d4a3e] text-white text-sm font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                  <p className="text-sm text-gray-600 leading-relaxed mt-0.5">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 p-4 rounded-lg bg-[#2d4a3e]/8 border border-[#2d4a3e]/20" style={{ backgroundColor: "rgba(45,74,62,0.07)" }}>
          <span className="flex-shrink-0 mt-0.5 text-[#2d4a3e]">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
          </span>
          <p className="text-sm text-[#2d4a3e] leading-relaxed font-medium">{slide.highlight}</p>
        </div>
      </div>
    );
  }

  // ── Stages ─────────────────────────────────────────────────────────────────

  function renderIntro() {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="h-2 bg-[#2d4a3e]" />
          <div className="p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-3">{training.title}</h1>
            <p className="text-gray-600 leading-relaxed mb-6">{training.description}</p>
            <div className="space-y-3 mb-8">
              <div className="flex gap-3 items-start p-3 rounded-lg bg-gray-50 border border-gray-100">
                <svg className="w-4 h-4 text-[#2d4a3e] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Legal Basis</p>
                  <p className="text-sm text-gray-700">{training.legalBasis}</p>
                </div>
              </div>
              <div className="flex gap-3 items-start p-3 rounded-lg bg-gray-50 border border-gray-100">
                <svg className="w-4 h-4 text-[#2d4a3e] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Estimated Time</p>
                  <p className="text-sm text-gray-700">{training.estimatedTime}</p>
                </div>
              </div>
              <div className="flex gap-3 items-start p-3 rounded-lg bg-gray-50 border border-gray-100">
                <svg className="w-4 h-4 text-[#2d4a3e] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Format</p>
                  <p className="text-sm text-gray-700">{training.slides.length} content sections · {training.quiz.length}-question knowledge check · Digital certificate</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setProgress(p => ({ ...p, stage: "slides", slideIndex: 0 }))}
              className="w-full py-3 px-6 bg-[#2d4a3e] text-white font-semibold rounded-xl hover:bg-[#3a5e50] transition-colors"
            >
              Begin Training
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderSlides() {
    const slide = training.slides[progress.slideIndex];
    const isLast = progress.slideIndex === training.slides.length - 1;
    const progressPct = ((progress.slideIndex + 1) / training.slides.length) * 100;

    return (
      <div className="max-w-2xl mx-auto">
        {/* Progress */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Slide {progress.slideIndex + 1} of {training.slides.length}</span>
            <span>{Math.round(progressPct)}% complete</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-[#2d4a3e] rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* Slide card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 mb-4">
          {renderSlideContent(slide)}
        </div>

        {/* Navigation */}
        <div className="flex justify-between gap-3">
          <button
            onClick={() => setProgress(p => ({ ...p, slideIndex: Math.max(0, p.slideIndex - 1) }))}
            disabled={progress.slideIndex === 0}
            className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Back
          </button>
          {isLast ? (
            <button
              onClick={() => setProgress(p => ({ ...p, stage: "quiz", quizIndex: 0 }))}
              className="px-6 py-2.5 rounded-xl bg-[#2d4a3e] text-white font-semibold text-sm hover:bg-[#3a5e50] transition-colors"
            >
              Continue to Quiz
            </button>
          ) : (
            <button
              onClick={() => setProgress(p => ({ ...p, slideIndex: p.slideIndex + 1 }))}
              className="px-6 py-2.5 rounded-xl bg-[#2d4a3e] text-white font-semibold text-sm hover:bg-[#3a5e50] transition-colors"
            >
              Next
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderQuiz() {
    const q = training.quiz[progress.quizIndex];
    const state = progress.quiz[progress.quizIndex];
    const isLast = progress.quizIndex === training.quiz.length - 1;
    const progressPct = ((progress.quizIndex + 1) / training.quiz.length) * 100;
    const isCorrect = state.answered && state.selected === q.correctIndex;

    function selectAnswer(idx: number) {
      if (state.answered) return;
      setProgress(p => {
        const quiz = [...p.quiz];
        quiz[p.quizIndex] = { ...quiz[p.quizIndex], selected: idx };
        return { ...p, quiz };
      });
    }

    function submitAnswer() {
      if (state.selected === null) return;
      setProgress(p => {
        const quiz = [...p.quiz];
        quiz[p.quizIndex] = { ...quiz[p.quizIndex], answered: true };
        return { ...p, quiz };
      });
    }

    function next() {
      if (isLast) {
        setProgress(p => ({ ...p, stage: "certificate" }));
      } else {
        setProgress(p => ({ ...p, quizIndex: p.quizIndex + 1 }));
      }
    }

    return (
      <div className="max-w-2xl mx-auto">
        {/* Progress */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Question {progress.quizIndex + 1} of {training.quiz.length}</span>
            <span>Knowledge Check</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-[#C9A96E] rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 mb-4">
          <p className="text-base font-semibold text-gray-900 leading-relaxed mb-5">{q.question}</p>

          <div className="space-y-2 mb-5">
            {q.options.map((opt, i) => {
              let cls = "w-full text-left p-3 rounded-xl border text-sm leading-relaxed transition-colors ";
              if (!state.answered) {
                cls += state.selected === i
                  ? "border-[#2d4a3e] bg-[#2d4a3e]/5 text-[#2d4a3e] font-medium"
                  : "border-gray-200 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer";
              } else {
                if (i === q.correctIndex) {
                  cls += "border-green-300 bg-green-50 text-green-800 font-medium";
                } else if (i === state.selected && !isCorrect) {
                  cls += "border-red-300 bg-red-50 text-red-800";
                } else {
                  cls += "border-gray-100 bg-gray-50 text-gray-400 cursor-default";
                }
              }
              return (
                <button key={i} className={cls} onClick={() => selectAnswer(i)} disabled={state.answered}>
                  <span className="flex items-start gap-2.5">
                    <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold" style={{
                      borderColor: state.answered && i === q.correctIndex ? "#16a34a" : state.answered && i === state.selected && !isCorrect ? "#dc2626" : state.selected === i && !state.answered ? "#2d4a3e" : "#d1d5db",
                      color: state.answered && i === q.correctIndex ? "#16a34a" : state.answered && i === state.selected && !isCorrect ? "#dc2626" : state.selected === i && !state.answered ? "#2d4a3e" : "#9ca3af",
                    }}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    {opt}
                  </span>
                </button>
              );
            })}
          </div>

          {state.answered && (
            <div className={`p-4 rounded-xl border text-sm leading-relaxed ${isCorrect ? "bg-green-50 border-green-300 text-green-800" : "bg-red-50 border-red-300 text-red-800"}`}>
              <p className="font-semibold mb-1">{isCorrect ? "Correct!" : "Incorrect"}</p>
              <p>{q.feedback}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          {!state.answered ? (
            <button
              onClick={submitAnswer}
              disabled={state.selected === null}
              className="px-6 py-2.5 rounded-xl bg-[#2d4a3e] text-white font-semibold text-sm hover:bg-[#3a5e50] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Submit Answer
            </button>
          ) : (
            <button
              onClick={next}
              className="px-6 py-2.5 rounded-xl bg-[#2d4a3e] text-white font-semibold text-sm hover:bg-[#3a5e50] transition-colors"
            >
              {isLast ? "View Certificate" : "Next Question"}
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderCertificate() {
    const correct = progress.quiz.filter((q, i) => q.answered && q.selected === training.quiz[i].correctIndex).length;
    const total = training.quiz.length;
    const pct = Math.round((correct / total) * 100);
    const completedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: "2px solid #C9A96E" }}>
          <div className="bg-[#2d4a3e] px-8 py-6">
            <p className="text-[#C9A96E] text-xs font-semibold uppercase tracking-widest mb-1">Certificate of Completion</p>
            <h2 className="text-white text-xl font-bold">{training.title}</h2>
          </div>

          <div className="p-8">
            {/* Score badge */}
            <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className={`w-16 h-16 rounded-full flex flex-col items-center justify-center font-bold flex-shrink-0 ${pct === 100 ? "bg-green-100 text-green-700" : pct >= 75 ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                <span className="text-xl leading-none">{pct}%</span>
                <span className="text-xs mt-0.5 opacity-80">Score</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Quiz Complete</p>
                <p className="text-sm text-gray-500">{correct} of {total} questions correct</p>
                <p className="text-sm text-gray-500 mt-0.5">Completed {completedDate}</p>
              </div>
            </div>

            {/* Certificate details */}
            <div className="space-y-2 mb-6">
              <div className="grid grid-cols-3 gap-1 py-2.5 border-b border-gray-100">
                <span className="text-sm text-gray-500">Employee</span>
                <span className="col-span-2 text-sm font-medium text-gray-900">{userName}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-2.5 border-b border-gray-100">
                <span className="text-sm text-gray-500">Email</span>
                <span className="col-span-2 text-sm text-gray-700">{userEmail || "—"}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-2.5 border-b border-gray-100">
                <span className="text-sm text-gray-500">Training</span>
                <span className="col-span-2 text-sm text-gray-700">{training.title}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-2.5 border-b border-gray-100">
                <span className="text-sm text-gray-500">Date</span>
                <span className="col-span-2 text-sm text-gray-700">{completedDate}</span>
              </div>
            </div>

            {/* Chicago checkbox (harassment only) */}
            {training.id === "harassment" && (
              <label className="flex gap-3 items-start p-3 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer mb-5 hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  className="mt-0.5 flex-shrink-0 accent-[#2d4a3e]"
                  checked={progress.includesChicago}
                  onChange={e => setProgress(p => ({ ...p, includesChicago: e.target.checked }))}
                  disabled={progress.submitted}
                />
                <span className="text-sm text-gray-700 leading-relaxed">
                  I work in Chicago or supervise employees who work in Chicago. I acknowledge that the annual Chicago Bystander Intervention Training is also required for my role.
                </span>
              </label>
            )}

            {/* Legal acknowledgment */}
            <p className="text-xs text-gray-500 leading-relaxed mb-5 italic">
              By submitting this certificate, I acknowledge that I have completed this training, understood its contents, and agree to comply with Top Tier Transitions LLC&apos;s anti-harassment policy and all applicable laws.
            </p>

            {/* Submit button */}
            {progress.submitted ? (
              <div className="flex items-center gap-2.5 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800">
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium">Your certificate has been recorded and emailed to HR.</span>
              </div>
            ) : (
              <>
                {progress.error && (
                  <p className="text-sm text-red-600 mb-3">{progress.error}</p>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={progress.submitting}
                  className="w-full py-3 px-6 bg-[#2d4a3e] text-white font-semibold rounded-xl hover:bg-[#3a5e50] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {progress.submitting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Submitting...
                    </>
                  ) : (
                    "Submit & Email Certificate"
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Restart link */}
        {progress.submitted && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setProgress(makeProgress(training.quiz.length))}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Retake training
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Main layout ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Top bar */}
      <header className="bg-[#2d4a3e] text-white shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <span className="font-semibold text-base tracking-tight">Top Tier Transitions</span>
          <span className="text-sm text-white/70">{userName}</span>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex gap-0">
          {([["harassment", "Harassment Prevention"], ["bystander", "Bystander Intervention"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => switchTab(id)}
              className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? "border-[#2d4a3e] text-[#2d4a3e]"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {label}
              {(id === "harassment" ? harassmentProgress : bystanderProgress).submitted && (
                <span className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100 text-green-700 text-[9px] font-bold">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {progress.stage === "intro" && renderIntro()}
        {progress.stage === "slides" && renderSlides()}
        {progress.stage === "quiz" && renderQuiz()}
        {progress.stage === "certificate" && renderCertificate()}
      </main>
    </div>
  );
}
