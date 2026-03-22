export interface TodayShift {
  id: string;
  activity: string;
  notes?: string;
  startTime?: string;
  endTime?: string;
  projectName: string;
  fullAddress?: string;
  mapUrl?: string;
  teammates: Array<{
    displayName: string;
    phone?: string;
    imageUrl?: string;
    initials: string;
  }>;
}

function fmt12h(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function fmtDay(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

interface TodaysPlanProps {
  shifts: TodayShift[];
  today: string; // YYYY-MM-DD
}

export function TodaysPlan({ shifts, today }: TodaysPlanProps) {
  return (
    <section className="mb-8">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-base font-semibold text-gray-900">Today&apos;s Plan</h2>
        <span className="text-xs text-gray-400">{fmtDay(today)}</span>
      </div>

      {shifts.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl px-6 py-8 text-center">
          <div className="w-11 h-11 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-700">Nothing Scheduled for You</p>
          <p className="text-xs text-gray-400 mt-1">No Daily Focus shifts assigned today.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shifts.map((shift) => (
            <div key={shift.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              {/* Project + activity */}
              <div className="mb-4">
                <p className="text-lg font-bold text-gray-900 leading-tight">{shift.projectName}</p>
                <span className="inline-block mt-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-forest-50 text-forest-700">
                  {shift.activity}
                </span>
              </div>

              <div className="space-y-2.5">
                {/* Time */}
                {(shift.startTime || shift.endTime) && (
                  <div className="flex items-center gap-2.5 text-sm text-gray-700">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className="font-medium">
                      {shift.startTime ? fmt12h(shift.startTime) : ""}
                      {shift.endTime ? ` – ${fmt12h(shift.endTime)}` : ""}
                    </span>
                  </div>
                )}

                {/* Address */}
                {shift.fullAddress && (
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    {shift.mapUrl ? (
                      <a
                        href={shift.mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 underline underline-offset-2 leading-snug"
                      >
                        {shift.fullAddress}
                      </a>
                    ) : (
                      <span className="text-sm text-gray-700 leading-snug">{shift.fullAddress}</span>
                    )}
                  </div>
                )}

                {/* Notes */}
                {shift.notes && (
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-600 leading-snug">{shift.notes}</p>
                  </div>
                )}
              </div>

              {/* Team members */}
              {shift.teammates.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                    Your Team Today
                  </p>
                  <div className="flex flex-col gap-3">
                    {shift.teammates.map((t, i) => (
                      <div key={i} className="flex items-center gap-3">
                        {/* Avatar */}
                        {t.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={t.imageUrl}
                            alt={t.displayName}
                            className="w-10 h-10 rounded-full object-cover flex-shrink-0 border border-gray-200"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-forest-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-forest-700">{t.initials}</span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 leading-tight">{t.displayName}</p>
                          {t.phone ? (
                            <a
                              href={`tel:${t.phone.replace(/\D/g, "")}`}
                              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                              {t.phone}
                            </a>
                          ) : (
                            <p className="text-xs text-gray-400">No phone on file</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
