/**
 * Role guides (/guide) in ARABIC: one simple page per role with numbered steps of the new menus. Help pages for
 * staff and parents, so they are written in Arabic on purpose; the rest of the interface stays English.
 * Kept under src/i18n because Arabic text lives only here.
 */
export type Step = { title: string; text: string; href: string; where: string };
export type Guide = { title: string; intro: string; steps: Step[]; ask: string };
export const GUIDES: Record<"STUDENT" | "TEACHER" | "SCHOOL_ADMIN", Guide> = {
  STUDENT: {
    title: "دليل الطالب",
    intro: "القائمة صارت أقصر وأبسط. هذه الخطوات تقول لك أين تجد كل شيء.",
    ask: "عندك سؤال؟ اسأل معلمك.",
    steps: [
      { title: "ابدأ من «My Work»", where: "أول زر في القائمة", text: "هنا كل ما أرسله لك المعلم. اضغط «Start» على أول مهمة. الأرقام الحمراء تعني أن المهمة متأخرة أو موعدها اليوم.", href: "/student" },
      { title: "البرامج: MAP وخريطة المنهج", where: "مجموعة «Programs»", text: "نتائج MAP وخطتك، وخريطة المنهج لصفك. يظهر RTI و NAFS هنا فقط إذا كانا لك.", href: "/student/map" },
      { title: "القراءة", where: "مجموعة «Reading»", text: "ReadMaster و ReadRise و Fluency Coach. اقرأ في مستواك أو أعلى. انقر مرتين على أي كلمة لترى معناها.", href: "/student/readmaster" },
      { title: "إنجازاتي", where: "مجموعة «Achievements»", text: "اختباراتي (My Tests) وشهاداتي (My Certificates) وأوسمتي (Badges).", href: "/student/tests" },
      { title: "تقاريري", where: "زر «My Reports»", text: "كل تقاريرك في مكان واحد: تقدمك، واختباراتك، وتقرير الأسرة.", href: "/student/reports" },
      { title: "المزيد", where: "مجموعة «More» (مطوية)", text: "اضغط «More» لفتحها: دروسي، مراجعة أخطائي، كلماتي، الكتابة، الاستجابة للقراءة، والمساعدة.", href: "/student/review" },
      { title: "اللعب المباشر", where: "زر الصفحة الرئيسية", text: "للانضمام إلى تحدٍ مباشر استخدم زر «Join Live» في صفحتك الرئيسية واكتب الرمز من المعلم.", href: "/student" },
    ],
  },
  TEACHER: {
    title: "دليل المعلم",
    intro: "القائمة صارت قصيرة: ثماني مجموعات، والصفحات الأقل استخدامًا تحت «More». هذه أماكن الأشياء الآن.",
    ask: "عندك سؤال؟ اسأل رئيس قسم اللغة الإنجليزية. ولإرسال ملاحظة استخدم زر «Feedback» في الأعلى.",
    steps: [
      { title: "الصفحة الرئيسية: صفّك اليوم", where: "«Home»", text: "ثلاثة أرقام كبيرة: من عمل اليوم، من يحتاج مساعدة، من لم يبدأ. اضغط أي رقم لترى الأسماء. وفيها «ابحث عن مهارة وأسندها».", href: "/teacher" },
      { title: "طلابي", where: "«My Students»", text: "قائمة كل طلابك جاهزة ومقسمة حسب الفصل. اكتب حرفًا واحدًا من الاسم (عربي أو إنجليزي) أو رقم الطالب. اضغط الاسم لفتح ملفه. «البحث عن طالب» و«فصولي» صارا هنا.", href: "/teacher/students" },
      { title: "البرامج", where: "مجموعة «Programs»", text: "MAP (الدرجات والخطط داخل صفحة MAP)، خريطة المنهج، RTI، والخطط (Plans). الإسنادات القديمة موجودة داخل «Plans».", href: "/teacher/map-center" },
      { title: "الاختبارات والتحدي المباشر", where: "«Assessments» و«Live Challenge»", text: "ابنِ اختبارًا من المهارات وأسنده. أو شغّل تحديًا مباشرًا للفصل كله.", href: "/teacher/assessments" },
      { title: "التقارير", where: "«Reports»", text: "ثلاث خطوات: اختر التقرير ← اختر الفصل أو الطالب أو المجموعة والفترة ← معاينة، ثم «Download PDF» أو «Send to parents». تقارير الأسرة وتقدم الطلاب صارت هنا.", href: "/teacher/reports" },
      { title: "أسبوعي", where: "«My Week»", text: "خطة كل يوم، وما موعد تسليمه هذا الأسبوع، ومن لم يبدأ، والتحديات المباشرة. زر واحد: «Plan next week».", href: "/teacher/week" },
      { title: "المزيد", where: "مجموعة «More» (مطوية)", text: "المستويات والمجموعات، اجتماع البيانات، الاختبار التشخيصي، الطلاقة، ReadRise، أوراق العمل، الكتابة، القاموس، القواعد، التقويم، والمساعدة.", href: "/teacher/tiers" },
    ],
  },
  SCHOOL_ADMIN: {
    title: "دليل الإدارة",
    intro: "قائمة الإدارة صارت خمسة أقسام، والباقي تحت «More» وفي «All Admin Tools».",
    ask: "تجد كل صفحة إدارية في «All Admin Tools»: اكتب كلمة للبحث.",
    steps: [
      { title: "المدرسة", where: "قسم «School»", text: "صفحة المدرسة، المستخدمون (Users)، البحث عن طالب، ومتابعة المعلمين.", href: "/admin/users" },
      { title: "المحتوى", where: "قسم «Content»", text: "بنك الأسئلة، «Sort Questions» لمراجعة ربط الأسئلة بالمهارات، ReadRise، ReadMaster، خريطة المنهج، القواعد، والقاموس.", href: "/admin/questions" },
      { title: "الاختبارات والبرامج", where: "قسم «Assessments & Programs»", text: "اختبارات المعلمين، MAP، ربط NAFS، المستويات (Below / On / Above) ومستويات الدعم، وخطة RTI الأسبوعية.", href: "/teacher/map-center" },
      { title: "التقارير", where: "قسم «Reports»", text: "التحليلات، تقرير نهاية الفصل، التقارير المنتظرة للموافقة، ومركز التقارير.", href: "/admin/report-approvals" },
      { title: "الإعدادات", where: "قسم «Settings»", text: "الإعدادات، أدوات الذكاء الاصطناعي، النسخ الاحتياطي، صحة البيانات، تنظيف البيانات، والملاحظات (Feedback).", href: "/admin/settings" },
      { title: "المزيد وكل الأدوات", where: "«More» و«All Admin Tools»", text: "كل الصفحات الأخرى ما زالت تعمل. افتح «All Admin Tools» واكتب كلمة مثل MAP أو backup.", href: "/admin/all" },
    ],
  },
};

export const ROLE_LABEL: Record<keyof typeof GUIDES, string> = { SCHOOL_ADMIN: "الإدارة", TEACHER: "المعلم", STUDENT: "الطالب" };

/** The few fixed words of the guide page. */
export const GUIDE_UI = { guides: "الأدلة", privacy: "الخصوصية" };
