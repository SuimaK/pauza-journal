'use strict';
/* Пауза. Данные сохраняются только в localStorage устройства. */
const KEY = 'pause-journal-data-v1';
const DEFAULT_TIMES = ['09:00','11:30','14:00','16:30','19:00','21:30'];
const EMOTIONS = ['Спокойствие','Радость','Интерес','Грусть','Тревога','Раздражение','Злость','Усталость','Обида','Напряжение','Благодарность','Одиночество'];
const NEEDS = ['Вкуса','Энергии','Отдыха','Удовольствия','Переключения','Отключиться от мыслей','Интересных впечатлений','Времени для себя','Приятного общения','Физически голодна'];
const BUILTIN = [
 {id:'craving',title:'Что стоит за желанием сладкого?',subtitle:'Четыре шкалы и наблюдение за потребностями',icon:'🍫',duration:'2–3 мин'},
 {id:'mindful',title:'Сладкое без автоматизма',subtitle:'Три вопроса до еды и наблюдение за удовольствием',icon:'🌿',duration:'2 мин + наблюдение'},
 {id:'nextbite',title:'Пауза между кусочками',subtitle:'Заметить, что происходит с тягой, когда удовольствие слабеет',icon:'⏳',duration:'Около минуты'}
];
const initial = () => ({version:1,createdAt:new Date().toISOString(),settings:{times:DEFAULT_TIMES.slice(),checkinsPerDay:6},records:[],tasks:[]});
function loadData(){
 try{const raw=localStorage.getItem(KEY);if(!raw)return initial();const obj=JSON.parse(raw);if(!obj||!Array.isArray(obj.records)||!Array.isArray(obj.tasks)||!obj.settings)return initial();
 obj.settings.checkinsPerDay=obj.settings.checkinsPerDay===5?5:6;
 if(!Array.isArray(obj.settings.times))obj.settings.times=DEFAULT_TIMES.slice();
 obj.settings.times=normalizeTimes(obj.settings.times,obj.settings.checkinsPerDay);
 return obj;}catch(e){return initial();}
}
let db=loadData();let page='home';let practiceId=null;let editTask=false;let selectedEmotions=[];let selectedNeeds=[];let toastTimer=null;let dismissedReminder='';let biteTimerInterval=null;
function save(){try{localStorage.setItem(KEY,JSON.stringify(db));return true;}catch(e){alert('Не получилось сохранить данные. Проверьте свободное место в браузере и экспортируйте дневник.');return false;}}
const el=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const pad=n=>String(n).padStart(2,'0');
const localDateKey=(d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const prettyDate=d=>new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(d);
const shortDate=d=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}).format(d);
const fmtTime=date=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(new Date(date));
const dateOf=r=>localDateKey(new Date(r.at));
const today=()=>db.records.filter(r=>dateOf(r)===localDateKey());
const logs=()=>db.records.slice().sort((a,b)=>new Date(b.at)-new Date(a.at));
const range=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
const average=arr=>arr.length?Math.round(arr.reduce((a,b)=>a+b,0)/arr.length*10)/10:null;
const val=id=>el(id)?.value??'';
const pick=id=>Number(val(id));
const readyTimes=()=>db.settings.times.slice(0,db.settings.checkinsPerDay);
function normalizeTimes(times,count){const output=[];for(let i=0;i<count;i++){let s=times[i];if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s||''))s=DEFAULT_TIMES[i];output.push(s)}return output.sort();}
function notify(msg){const t=el('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3300);}
function navigate(next,id=null){page=next;practiceId=id;editTask=false;selectedEmotions=[];selectedNeeds=[];render();window.scrollTo({top:0,behavior:'instant'});}
function iconForRecord(r){return r.type==='checkin'?'◉':r.type==='craving'?'🍫':r.type==='mindful'?'🌿':r.type==='nextbite'?'⏳':'✎'}
function inputRange(id,label,def=5,left='Совсем нет',right='Очень сильно'){
 return `<div class="form-field"><div class="scale-row"><label for="${esc(id)}" class="field-label">${esc(label)}</label><output class="score" for="${esc(id)}" id="${esc(id)}-out">${def}</output></div><input type="range" id="${esc(id)}" min="0" max="10" value="${def}" step="1" aria-label="${esc(label)}"><div class="scale-ends"><span>${esc(left)}</span><span>${esc(right)}</span></div></div>`;
}
function choices(items,field){return `<div class="chips" id="${esc(field)}">${items.map(e=>`<button type="button" class="choice" aria-pressed="false" data-choice="${esc(e)}" data-choice-field="${esc(field)}">${esc(e)}</button>`).join('')}</div>`;}
function textArea(id,placeholder='Можно оставить пустым',rows=3){return `<textarea id="${esc(id)}" rows="${rows}" placeholder="${esc(placeholder)}"></textarea>`;}
function slotStatus(t){const rec=today().filter(r=>r.type==='checkin'&&r.slot===t);return rec.length?'past':unfilledSlot()===t?'current':'';}
function toMins(t){const [h,m]=t.split(':').map(Number);return h*60+m;}
function unfilledSlot(){const min=new Date().getHours()*60+new Date().getMinutes();const times=readyTimes();return times.filter(t=>toMins(t)<=min&&!today().some(r=>r.type==='checkin'&&r.slot===t)).slice(-1)[0]||null;}
function upcoming(){const min=new Date().getHours()*60+new Date().getMinutes();return readyTimes().find(t=>toMins(t)>min)||null;}
function todayCheckins(){return today().filter(r=>r.type==='checkin');}
function header(title,desc,eyebrow){return `<section class="page-head"><div class="eyebrow">${esc(eyebrow||'Остаться на связи с собой')}</div><h1>${esc(title)}</h1>${desc?`<p class="lead">${esc(desc)}</p>`:''}</section>`;}
function historyRow(r){let title,desc;
 if(r.type==='checkin') {title='Отметка состояния';desc=`Настроение ${r.mood}/10 · Энергия ${r.energy}/10 · Напряжение ${r.stress}/10${r.emotions?.length?' · '+r.emotions.join(', '):''}`;}
 else if(r.type==='craving'){title='Желание сладкого · 4 шкалы';desc=`Тяга ${r.urge}/10${r.needs?.length?' · '+r.needs.join(', '):''}`;}
 else if(r.type==='mindful'){title='Сладкое без автоматизма';desc=r.completedAt?'Наблюдение завершено':'Первая часть сохранена · можно продолжить';}
 else if(r.type==='nextbite'){title='Пауза между кусочками';desc=r.stoppedEarly?'Упражнение прекращено':r.completedAt?`Тяга ${r.urgeBefore}/10 → ${r.urgeAfter}/10${r.decision?' · '+r.decision:''}`:'Начало сохранено · можно продолжить';}
 else {title=r.taskName||'Задание психолога';desc=`Ответов: ${r.responses?.length||0}`;}
 return `<div class="activity"><div class="activity-icon" aria-hidden="true">${iconForRecord(r)}</div><div class="activity-main"><strong>${esc(title)}</strong><p>${esc(desc)}</p>${r.note?`<p>${esc(r.note).slice(0,180)}</p>`:''}</div><time>${fmtTime(r.at)}</time></div>`;
}
function homeView(){
 const c=todayCheckins().length,completedSlots=new Set(todayCheckins().map(r=>r.slot).filter(Boolean)).size;
 const last=logs()[0],next=upcoming(),due=unfilledSlot();
 const day=prettyDate(new Date());
 const reminders=due&&dismissedReminder!==`${localDateKey()}:${due}`?`<div class="reminder"><strong>Подходит время небольшой паузы</strong><p>Для отметки состояния достаточно 30–60 секунд. Можно пропустить без объяснений.</p><div class="btn-row"><button class="btn small" data-go="checkin">Отметить состояние</button><button class="btn outline small" id="dismiss-reminder">Не сейчас</button></div></div>`:'';
 return `${header('Как ты сейчас?', 'Не оценка дня и не контроль поведения. Просто возможность заметить, что происходит.', 'Твоя пауза')}
 <div class="card lilac"><span class="chip accent">Сегодня · ${esc(day)}</span><h2 style="margin:16px 0 7px;font-size:25px">Несколько секунд для себя</h2><p>Что чувствуешь? Как твоё тело? Сколько сейчас сил?</p><button class="btn full" data-go="checkin">+ Записать состояние</button><div class="progress-dots">${readyTimes().map(t=>`<span class="dot ${todayCheckins().some(r=>r.slot===t)?'done':slotStatus(t)==='current'?'current':''}" title="${t}"></span>`).join('')}</div><div class="split small-copy muted"><span>Отметок сегодня: ${c}${completedSlots&&c!==completedSlots?` (${completedSlots} по расписанию)`:''}</span><span>${next?'Следующая пауза: '+next:'Все плановые паузы прошли'}</span></div></div>
 ${reminders}
 <div class="section-title"><h2>Практики</h2><button class="btn outline small" data-go="practice">Все задания</button></div>
 <div class="card"><div class="card-head"><div><div class="eyebrow">Наблюдение</div><h3>Что стоит за желанием сладкого?</h3></div><span class="chip">2–3 мин</span></div><p>Четыре шкалы: впечатления, время для себя, общение и сила желания сладкого.</p><button class="btn secondary" data-practice="craving">Открыть задание</button></div>
 <div class="card"><div class="card-head"><div><div class="eyebrow">Осознанность</div><h3>Сладкое без автоматизма</h3></div><span class="chip">Без запретов</span></div><p>Что хочется получить? Что ощущаю? Когда удовольствие меняется?</p><button class="btn secondary" data-practice="mindful">Открыть задание</button></div>
 <div class="card"><div class="card-head"><div><div class="eyebrow">Наблюдение во время еды</div><h3>Пауза между кусочками</h3></div><span class="chip">≈ 1 мин</span></div><p>Когда удовольствие снижается, а желание продолжать остаётся: оцени тягу, понаблюдай за ней минуту и сама реши, есть дальше или нет.</p><button class="btn secondary" data-practice="nextbite">Открыть задание</button></div>
 <div class="section-title"><h2>Последняя запись</h2><button class="btn outline small" data-go="history">История</button></div>
 <div class="card">${last?historyRow(last):`<div class="empty"><span class="emoji" aria-hidden="true">✧</span><h3>Здесь появится твоя первая запись</h3><p>Не нужно ничего заполнять задним числом.</p></div>`}</div>`;
}
function checkinView(){return `${header('Короткая отметка','Ответь, как есть. Здесь нет правильных значений и не нужно ничего исправлять.','30–60 секунд')}
<form id="checkin-form" class="card">
 ${inputRange('mood','Настроение',5,'Очень тяжело','Очень хорошо')}
 ${inputRange('energy','Сколько сейчас энергии?',5,'Совсем нет','Много')}
 ${inputRange('stress','Напряжение / стресс',5,'Спокойно','Очень напряжённо')}
 ${inputRange('body','Физическое самочувствие',5,'Очень плохо','Очень хорошо')}
 <div class="form-field"><label class="field-label">Какие чувства сейчас заметны?</label><span class="field-note">Можно выбрать несколько или пропустить.</span>${choices(EMOTIONS,'emotions')}</div>
 <div class="form-field"><label class="field-label" for="checkin-note">Что происходит вокруг или внутри?</label>${textArea('checkin-note','Например: много дел, устала, удалось побыть одной, захотелось переключиться…')}</div>
 <div class="form-field"><label class="field-label" for="sweet-urge">Тяга к сладкому сейчас (по желанию)</label><select id="sweet-urge"><option value="">Не отмечать</option>${Array.from({length:11},(_,i)=>`<option value="${i}">${i} из 10</option>`).join('')}</select></div>
 <button class="btn full" type="submit">Сохранить отметку</button>
 <p class="small-copy" style="margin-top:15px">Пропущенные проверки не считаются неудачей. Ты можешь записывать состояние в любое время.</p>
 </form>`;}
function practiceView(){const pending=logs().filter(r=>r.type==='mindful'&&!r.completedAt);const pendingBite=logs().filter(r=>r.type==='nextbite'&&!r.completedAt);
 return `${header('Практики психолога','Небольшие упражнения для наблюдения за собой — без контроля еды, оценок и обязательств.','Работа в своём темпе')}
 ${BUILTIN.map(t=>`<div class="card"><div class="card-head"><div><div class="eyebrow">${t.icon} · ${t.duration}</div><h2>${esc(t.title)}</h2></div></div><p>${esc(t.subtitle)}</p><button class="btn secondary" data-practice="${t.id}">Начать</button></div>`).join('')}
 ${pending.length?`<div class="card mint"><div class="eyebrow">Незавершённое наблюдение</div><h3>Можно вернуться к записи</h3><p>Продолжай только если это ещё актуально. Можно также оставить её как есть.</p><button class="btn" data-finish-mindful="${esc(pending[0].id)}">Продолжить</button></div>`:''}
 ${pendingBite.length?`<div class="card mint"><div class="eyebrow">Незавершённое упражнение</div><h3>Пауза между кусочками</h3><p>Можно дополнить запись, если это ещё актуально, или оставить незавершённой.</p><button class="btn" data-finish-bite="${esc(pendingBite[0].id)}">Продолжить</button></div>`:''}
 <div class="section-title"><h2>Мои задания</h2><button class="btn outline small" id="add-task">+ Добавить</button></div>
 ${db.tasks.length?db.tasks.map(t=>`<div class="card"><div class="split"><div><h3>${esc(t.name)}</h3><p>${esc(t.description||'Пользовательское задание')}</p><span class="small-copy muted">Вопросов: ${t.questions.length}</span></div><button class="btn outline small" data-delete-task="${esc(t.id)}" aria-label="Удалить задание ${esc(t.name)}">×</button></div><div class="btn-row"><button class="btn secondary" data-practice="${esc(t.id)}">Открыть</button></div></div>`).join(''):`<div class="card"><p>Добавь задания, которые предлагает психолог. Для каждого можно указать вопросы и тип ответа.</p><button class="btn secondary" id="add-task-empty">Добавить своё задание</button></div>`}
 `;}
function cravingView(){return `${header('Что стоит за желанием сладкого?','Заметь силу тяги и то, чего сейчас не хватает. Можно съесть сладкое после записи — задача не в ограничении.','Практика · четыре шкалы')}
<form id="craving-form" class="card">
 <p class="small-copy">Шкала от 0 до 10: насколько сейчас ощущается нехватка или потребность.</p>
 ${inputRange('lack-impressions','Не хватает интересных впечатлений',5)}
 ${inputRange('lack-time','Не хватает времени на себя',5)}
 ${inputRange('lack-communication','Не хватает приятного общения',5)}
 ${inputRange('craving-urge','Сила тяги к сладкому',5)}
 <div class="form-field"><label class="field-label">Что мне хочется получить прямо сейчас?</label><span class="field-note">Можно отметить несколько вариантов. Включая возможность просто отключиться от мыслей.</span>${choices(NEEDS,'needs')}</div>
 <div class="form-field"><label class="field-label" for="craving-note">Что замечаю?</label>${textArea('craving-note','Что происходило перед желанием сладкого? О чём хочется не думать?')}</div>
 <div class="callout">Это поиск закономерностей, а не проверка самоконтроля. Связь между показателями ещё не означает причинную зависимость.</div>
 <button class="btn full" type="submit">Сохранить наблюдение</button>
 </form>`;}
function mindfulView(){return `${header('Сладкое без автоматизма','Если хочется сладкого, можно понаблюдать за своим опытом. Не надо прекращать есть или искать замену.','Практика · до еды')}
<form id="mindful-form" class="card">
 <div class="form-field"><label class="field-label">1. Чего хочется на самом деле?</label><span class="field-note">Вкуса, энергии, отдыха, удовольствия, переключения — или чего-то другого.</span>${choices(NEEDS,'needs')}</div>
 <div class="form-field"><label class="field-label" for="feel-before">2. Что я чувствую непосредственно перед тем, как взять сладкое?</label>${textArea('feel-before','Можно описать чувства, телесные ощущения или мысли')}</div>
 <div class="form-field"><label class="field-label" for="expectation">Что хочется получить от этого момента?</label>${textArea('expectation','Необязательно заполнять')}</div>
 <div class="callout">3. Во время еды, если захочется, обрати внимание: в какой момент удовольствие меняется и что происходит с тягой. Продолжить запись можно позже.</div>
 <button class="btn full" type="submit">Сохранить первую часть</button>
 </form>`;}
function finishMindfulView(id){const r=db.records.find(x=>x.id===id&&x.type==='mindful');if(!r)return practiceView();
 return `${header('Как изменялось удовольствие?','Не обязательно доедать, останавливаться или оценивать количество. Только наблюдение.','Практика · в процессе или после')}
 <div class="card"><h3>Перед этим ты заметила</h3><p>${esc(r.needs?.join(', ')||'Выбранных потребностей нет')}${r.feelings?`<br>${esc(r.feelings)}`:''}</p><span class="small-copy muted">${fmtTime(r.at)}</span></div>
 <form id="mindful-finish-form" data-record-id="${esc(id)}" class="card">
 <div class="form-field"><label class="field-label" for="pleasure-shift">Что произошло с удовольствием?</label><select id="pleasure-shift"><option value="">Выбрать необязательно</option>${['Оно постепенно уменьшилось','Я заметила момент, когда удовольствие стало слабее','Оставалось приятным до конца','Пока не заметила','В этот раз не ела сладкое'].map(x=>`<option>${esc(x)}</option>`).join('')}</select></div>
 ${inputRange('urge-after','Сила тяги сейчас',5)}
 <div class="form-field"><label class="field-label" for="mindful-after-note">Что происходило дальше?</label>${textArea('mindful-after-note','Что изменилось в чувствах, ощущениях, мыслях?')}</div>
 <button class="btn full" type="submit">Завершить наблюдение</button>
 </form>`;}
function nextBiteView(){return `${header('Пауза между кусочками','Попробуй заметить момент, когда удовольствие от сладкого начинает снижаться, но желание продолжить остаётся. Не нужно специально ждать или добиваться такого момента.','Практика · во время еды')}
 <form id="nextbite-form" class="card">
 <p>Если такой момент появился, остановись на короткое наблюдение. Если нет — упражнение можно пропустить.</p>
 ${inputRange('bite-urge-before','1. Насколько сильна тяга сейчас?',5)}
 <div class="form-field"><label class="field-label" for="bite-next-wish">2. Чего я сейчас хочу от следующего кусочка?</label>${textArea('bite-next-wish','Например: вкуса, удовольствия, успокоения, отключиться от мыслей…')}</div>
 <div class="callout">3. Сделай паузу примерно на минуту и понаблюдай, меняется ли тяга. Можно завершить паузу раньше, если она вызывает напряжение. После этого ты сама решаешь, продолжать есть или нет — оба варианта допустимы.</div>
 <button class="btn full" type="submit">Начать минутную паузу</button>
 </form>`;}
function finishNextBiteView(id){const r=db.records.find(x=>x.id===id&&x.type==='nextbite');if(!r)return practiceView();
 const elapsed=r.pauseEndedAt?Math.max(0,Math.round((new Date(r.pauseEndedAt)-new Date(r.pauseStartedAt))/1000)):Math.max(0,Math.floor((Date.now()-new Date(r.pauseStartedAt))/1000));
 return `${header('Наблюдаем за тягой','В течение приблизительно минуты просто замечай ощущения и мысли. Не нужно пытаться подавлять желание.','Практика · минута паузы')}
 <div class="card mint"><div class="eyebrow">Пауза</div><h2 id="bite-countdown" role="timer" aria-live="off">${r.pauseEndedAt?'Пауза завершена':elapsed>=60?'Прошла примерно минута':`Осталось ${Math.floor((60-elapsed)/60)}:${pad((60-elapsed)%60)}`}</h2><p>Тяга до паузы: <strong>${r.urgeBefore}/10</strong>${r.nextBiteWish?`<span class="field-note">Чего хотелось от следующего кусочка: ${esc(r.nextBiteWish)}</span>`:''}</p>
 <p class="small-copy">Можно спокойно наблюдать за тягой. Если эксперимент вызывает сильное напряжение, его можно прекратить.</p>
 ${!r.pauseEndedAt&&elapsed<60?`<button type="button" class="btn outline small" id="stop-bite-pause" data-record-id="${esc(id)}">Завершить паузу раньше</button>`:''}</div>
 <form id="nextbite-finish-form" data-record-id="${esc(id)}" class="card">
 ${inputRange('bite-urge-after','4. Сила тяги после паузы',r.urgeBefore)}
 <div class="form-field"><label class="field-label" for="bite-after-note">Что изменилось за время паузы?</label>${textArea('bite-after-note','Тяга усилилась, уменьшилась, осталась прежней? Какие мысли и ощущения ты заметила?')}</div>
 <div class="form-field"><label class="field-label" for="bite-decision">5. Что ты решила после паузы?</label><select id="bite-decision"><option value="">Пока не решила / не хочу отмечать</option><option>Продолжить есть</option><option>Не продолжать сейчас</option></select></div>
 <div class="callout">Оба решения одинаково допустимы. Это не тренировка силы воли и не способ заставить себя съесть меньше — мы исследуем, что происходит с желанием.</div>
 <button class="btn full" type="submit">Сохранить наблюдение</button>
 <button class="btn outline full" style="margin-top:10px" type="button" id="abandon-bite-practice" data-record-id="${esc(id)}">Прекратить упражнение без оценки</button>
 </form>`;}
function startBiteTimer(){if(biteTimerInterval){clearInterval(biteTimerInterval);biteTimerInterval=null;}
 const out=el('bite-countdown');if(!out)return;
 const r=db.records.find(x=>x.id===el('nextbite-finish-form')?.dataset.recordId);
 if(!r||r.pauseEndedAt)return;
 const update=()=>{if(!out.isConnected){clearInterval(biteTimerInterval);biteTimerInterval=null;return;}
 const elapsed=Math.max(0,Math.floor((Date.now()-new Date(r.pauseStartedAt))/1000));const remain=Math.max(0,60-elapsed);
 out.textContent=remain?`Осталось ${Math.floor(remain/60)}:${pad(remain%60)}`:'Прошла примерно минута';
 if(!remain){el('stop-bite-pause')?.remove();clearInterval(biteTimerInterval);biteTimerInterval=null;}};
 update();if(!r.pauseEndedAt&&Date.now()-new Date(r.pauseStartedAt).getTime()<60000)biteTimerInterval=setInterval(update,1000);
}
function taskEditorView(){return `${header('Новое задание','Добавь упражнение психолога. Вопросы будут появляться в отдельной анкете.','Настройка практики')}
<form id="task-form" class="card"><div class="form-field"><label for="task-name" class="field-label">Название задания</label><input type="text" id="task-name" maxlength="100" placeholder="Например, проверка автоматических мыслей" required></div>
<div class="form-field"><label for="task-description" class="field-label">Короткое описание</label>${textArea('task-description','Когда выполнять и для чего',2)}</div>
<div class="form-field"><label for="task-questions" class="field-label">Вопросы, каждый с новой строки</label><span class="field-note">По умолчанию — текстовый ответ. Для шкалы напиши в начале строки «0-10:», например «0-10: Насколько сильна тревога?»</span><textarea id="task-questions" rows="7" placeholder="Что произошло?\nКакая мысль возникла?\n0-10: Насколько сильна эмоция?\nКакая альтернативная мысль возможна?" required></textarea></div>
<button class="btn full" type="submit">Сохранить задание</button></form>`;}
function customTaskView(id){const task=db.tasks.find(t=>t.id===id);if(!task)return practiceView();
 return `${header(task.name,task.description||'Ответы останутся в личной истории.','Моё задание')}
 <form class="card" id="custom-task-form" data-task-id="${esc(task.id)}">${task.questions.map((q,i)=>q.type==='scale'?inputRange(`custom-${i}`,q.text,5):`<div class="form-field"><label class="field-label" for="custom-${i}">${esc(q.text)}</label>${textArea(`custom-${i}`)}</div>`).join('')}
 <button class="btn full" type="submit">Сохранить ответы</button></form>`;}
function daysBack(n){const todayStart=new Date();todayStart.setHours(12,0,0,0);return Array.from({length:n},(_,i)=>{const d=new Date(todayStart);d.setDate(d.getDate()-(n-1-i));return d;});}
function chartSvg(){const days=daysBack(7);const values=days.map(d=>{const rs=db.records.filter(r=>r.type==='checkin'&&dateOf(r)===localDateKey(d));return {d, mood:average(rs.map(r=>r.mood)),energy:average(rs.map(r=>r.energy)),stress:average(rs.map(r=>r.stress))};});
 if(!values.some(x=>x.mood!==null))return `<p class="small-copy">График появится после первой отметки. Пропущенные дни останутся пустыми.</p>`;
 const w=620,h=208,left=30,right=16,top=13,bottom=34;const X=i=>left+i*(w-left-right)/6;const Y=v=>top+(10-v)*(h-top-bottom)/10;
 const lines=[['mood','#d5bcff'],['energy','#a3d7cb'],['stress','#f2bf9c']].map(([k,col])=>{
 let paths=[],points=[],active=[];values.forEach((v,i)=>{if(v[k]===null){if(active.length)paths.push(active.join(' '));active=[];return;}active.push(`${active.length?'L':'M'} ${X(i)} ${Y(v[k])}`);points.push(`<circle cx="${X(i)}" cy="${Y(v[k])}" r="3.7" fill="${col}"><title>${shortDate(v.d)}: ${v[k]}/10</title></circle>`);});if(active.length)paths.push(active.join(' '));return paths.map(p=>`<path d="${p}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`).join('')+points.join('');}).join('');
 return `<div class="chart-area"><svg class="trend-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Настроение, энергия и напряжение за последние семь дней. Разрывы — дни без записей.">${[0,5,10].map(v=>`<line x1="${left}" x2="${w-right}" y1="${Y(v)}" y2="${Y(v)}" stroke="#35465d" stroke-dasharray="3 5"/><text x="5" y="${Y(v)+5}" font-size="13" fill="#aab8cf">${v}</text>`).join('')}${values.map((v,i)=>`<text x="${X(i)}" y="${h-10}" text-anchor="middle" font-size="12" fill="#aab8cf">${pad(v.d.getDate())}.${pad(v.d.getMonth()+1)}</text>`).join('')}${lines}</svg><div class="legend"><span><i style="background:#d5bcff"></i>Настроение</span><span><i style="background:#a3d7cb"></i>Энергия</span><span><i style="background:#f2bf9c"></i>Напряжение</span></div></div>`;
}
function simpleStats(){const rs=db.records.filter(r=>r.type==='checkin'&&new Date(r.at)>=new Date(Date.now()-7*86400000));const nums=k=>rs.map(r=>r[k]).filter(x=>typeof x==='number');let c=nums('mood'),e=nums('energy'),s=nums('stress');return `<div class="metric-grid"><div class="metric"><strong>${c.length?average(c):'—'}</strong><span>Настроение</span></div><div class="metric"><strong>${e.length?average(e):'—'}</strong><span>Энергия</span></div><div class="metric"><strong>${s.length?average(s):'—'}</strong><span>Напряжение</span></div></div>`;}
function observePattern(){const observations=db.records.filter(r=>r.type==='craving');if(observations.length<5)return `После пяти наблюдений о желании сладкого здесь появится простое сравнение средних значений — без выводов о причинности.`;
 const high=observations.filter(r=>r.urge>=7),low=observations.filter(r=>r.urge<7);if(!high.length||!low.length)return 'Пока недостаточно разнообразных записей для сравнения сильной и умеренной тяги.';
 const names=[['impressions','нехватка впечатлений'],['time','нехватка времени для себя'],['communication','нехватка общения']];
 const comparisons=names.map(([k,label])=>({label,diff:average(high.map(x=>x[k]))-average(low.map(x=>x[k]))})).sort((a,b)=>b.diff-a.diff);
 const best=comparisons[0];if(best.diff<1)return 'Пока не видно заметных различий между записями с сильной и умеренной тягой к сладкому.';
 return `В твоих записях при сильной тяге к сладкому (${high.length}) показатель «${best.label}» в среднем выше примерно на ${Math.round(best.diff*10)/10} балла, чем при более слабой (${low.length}). Это лишь совпадение в небольшой выборке.`;
}
function historyView(){const rec=logs();const days=new Map();rec.slice(0,80).forEach(r=>{let d=dateOf(r);if(!days.has(d))days.set(d,[]);days.get(d).push(r);});
 return `${header('История наблюдений','Ищем не идеальные дни, а связи между состоянием, событиями и потребностями.','Твой дневник')}
 <div class="card"><h2>Последние 7 дней</h2><p class="small-copy">Средние значения только по заполненным отметкам. Отсутствие записей не приравнивается к нулю.</p>${simpleStats()}${chartSvg()}</div>
 <div class="card mint"><div class="eyebrow">Гипотеза, не диагноз</div><h3>Желание сладкого и потребности</h3><p>${esc(observePattern())}</p></div>
 <div class="section-title"><h2>Все записи</h2><span class="section-counter">${rec.length}</span></div>
 ${rec.length?Array.from(days,([date,rs])=>`<div class="card"><h3 class="day-label">${esc(prettyDate(new Date(date+'T12:00:00')))}</h3>${rs.map(r=>`<div>${historyRow(r)}<div class="btn-row" style="margin:0 0 9px 48px">${r.type==='mindful'&&!r.completedAt?`<button class="btn small secondary" data-finish-mindful="${esc(r.id)}">Продолжить</button>`:''}${r.type==='nextbite'&&!r.completedAt?`<button class="btn small secondary" data-finish-bite="${esc(r.id)}">Продолжить</button>`:''}<button class="btn outline small" data-detail="${esc(r.id)}">Подробнее</button></div></div>`).join('')}</div>`).join(''):`<div class="card empty"><span class="emoji">✧</span><h3>Записей пока нет</h3><p>Начни с первой короткой отметки — этого достаточно.</p><button class="btn" data-go="checkin">Отметить состояние</button></div>`}
 ${rec.length>80?'<p class="small-copy">Показаны последние 80 записей. Полный архив доступен в резервной копии JSON.</p>':''}`;
}
function detailsView(id){const r=db.records.find(x=>x.id===id);if(!r)return historyView();let lines=[];
 if(r.type==='checkin')lines=[['Настроение',r.mood+'/10'],['Энергия',r.energy+'/10'],['Напряжение',r.stress+'/10'],['Самочувствие',r.body+'/10'],['Эмоции',r.emotions?.join(', ')||'—'],['Тяга к сладкому',r.sweetUrge===null?'—':r.sweetUrge+'/10'],['Заметка',r.note||'—']];
 if(r.type==='craving')lines=[['Нехватка впечатлений',r.impressions+'/10'],['Нехватка времени для себя',r.time+'/10'],['Нехватка общения',r.communication+'/10'],['Тяга',r.urge+'/10'],['Что хотелось',r.needs?.join(', ')||'—'],['Заметка',r.note||'—']];
 if(r.type==='mindful')lines=[['Чего хотелось',r.needs?.join(', ')||'—'],['Чувства до',r.feelings||'—'],['Ожидания',r.expectation||'—'],['Изменение удовольствия',r.pleasureShift||'—'],['Тяга после',r.urgeAfter===undefined?'—':r.urgeAfter+'/10'],['Наблюдения после',r.afterNote||'—']];
 if(r.type==='nextbite')lines=[['Сила тяги до паузы',r.urgeBefore+'/10'],['Чего хотелось от следующего кусочка',r.nextBiteWish||'—'],['Длительность наблюдения',r.pauseSeconds===undefined?'—':r.pauseSeconds+' сек.'],['Сила тяги после',r.urgeAfter===undefined?'—':r.urgeAfter+'/10'],['Что произошло с тягой',r.afterNote||'—'],['Решение',r.decision||'—'],['Статус',r.stoppedEarly?'Упражнение прекращено':r.completedAt?'Наблюдение завершено':'Не завершено']];
 if(r.type==='custom')lines=(r.responses||[]).map(q=>[q.label,q.value||'—']);
 return `${header('Запись','Сохранено '+new Intl.DateTimeFormat('ru-RU',{dateStyle:'long',timeStyle:'short'}).format(new Date(r.at)),'Подробнее')}
 <div class="card">${lines.map(([k,v])=>`<div class="form-field" style="margin-bottom:15px"><span class="field-note">${esc(k)}</span><div style="overflow-wrap:anywhere">${esc(v)}</div></div>`).join('')}
 <hr class="divider"><div class="btn-row"> ${r.type==='mindful'&&!r.completedAt?`<button class="btn" data-finish-mindful="${esc(r.id)}">Продолжить</button>`:''}${r.type==='nextbite'&&!r.completedAt?`<button class="btn" data-finish-bite="${esc(r.id)}">Продолжить</button>`:''}<button class="btn outline" data-go="history">К истории</button><button class="btn danger" data-delete-record="${esc(r.id)}">Удалить запись</button></div></div>`;
}
function settingsView(){return `${header('Настройки','Напоминания, личные данные и резервные копии.','Для твоего ритма')}
 <div class="card"><h2>Ежедневные паузы</h2><p>Настрой 5 или 6 моментов в течение дня. Внутри открытого приложения появится приглашение заполнить отметку. Для напоминаний при закрытом приложении используй системный Календарь.</p>
 <form id="settings-form"><div class="form-field"><label class="field-label" for="checkins-per-day">Сколько напоминаний в день?</label><select id="checkins-per-day"><option value="5" ${db.settings.checkinsPerDay===5?'selected':''}>5 раз</option><option value="6" ${db.settings.checkinsPerDay===6?'selected':''}>6 раз</option></select></div>
 <div id="time-inputs" class="two-col">${readyTimes().map((t,i)=>`<div class="form-field"><label class="field-label" for="time-${i}">Пауза ${i+1}</label><input type="time" id="time-${i}" value="${esc(t)}" required></div>`).join('')}</div>
 <button class="btn secondary full" type="submit">Сохранить время</button></form>
 <div class="subtle-divider"></div><button class="btn full" id="download-calendar">Скачать напоминания для Календаря (.ics)</button>
 <p class="small-copy" style="margin-top:12px">Файл содержит повторяющиеся события и сигналы в выбранные часы на ближайший год. После изменения времени скачай обновлённый файл и удали старые события из Календаря, чтобы не было дублей.</p>
 <div class="safe-note">На iPhone обычный сайт не может самостоятельно отправлять гарантированные уведомления, когда он закрыт. Поэтому для фоновых сигналов здесь используется Календарь iPhone. Импорт .ics зависит от настроек iOS: иногда нужно открыть файл из «Файлов» или добавить его через почту/Календарь.</div>
 </div>
 <div class="card"><h2>Данные и приватность</h2><p>Все записи хранятся локально в этом браузере на этом устройстве. Они не отправляются на сервер, но могут исчезнуть при очистке данных Safari или смене устройства. Нет пароля и синхронизации.</p>
 <div class="btn-row"><button class="btn secondary" id="export-data">Скачать резервную копию</button><button class="btn outline" id="import-data">Восстановить из файла</button></div>
 <input type="file" accept="application/json,.json" id="import-file" class="hidden">
 <div class="subtle-divider"></div><button class="btn danger small" id="erase-data">Удалить все записи</button></div>
 <div class="card"><h2>Как добавить на iPhone</h2><ol class="help-list"><li>Опубликуй приложение на HTTPS-сайте (например, GitHub Pages).</li><li>Открой адрес в Safari → «Поделиться» → «На экран Домой».</li><li>Открой приложение с экрана Домой. После первого запуска оно работает и без интернета.</li><li>Для сигналов при закрытом приложении импортируй файл напоминаний в Календарь и разреши ему уведомления.</li></ol><p class="small-copy">При открытии index.html как обычного файла некоторые возможности (например, автономный режим) недоступны.</p></div>`;}
function render(){const v=el('view');if(!v)return;if(biteTimerInterval){clearInterval(biteTimerInterval);biteTimerInterval=null;}
 el('header-date').textContent=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',weekday:'short'}).format(new Date());
 if(page==='home')v.innerHTML=homeView();
 else if(page==='checkin')v.innerHTML=checkinView();
 else if(page==='practice')v.innerHTML=practiceId?practiceId.startsWith('finish:')?finishMindfulView(practiceId.slice(7)):practiceId.startsWith('finishbite:')?finishNextBiteView(practiceId.slice(11)):practiceId.startsWith('detail:')?detailsView(practiceId.slice(7)):practiceId==='craving'?cravingView():practiceId==='mindful'?mindfulView():practiceId==='nextbite'?nextBiteView():customTaskView(practiceId):editTask?taskEditorView():practiceView();
 else if(page==='history')v.innerHTML=practiceId?.startsWith('detail:')?detailsView(practiceId.slice(7)):historyView();
 else if(page==='settings')v.innerHTML=settingsView();
 document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===page);b.setAttribute('aria-current',b.dataset.tab===page?'page':'false');});
 attachHandlers();startBiteTimer();
}
function hookRanges(){document.querySelectorAll('input[type="range"]').forEach(input=>{input.addEventListener('input',()=>{const out=el(input.id+'-out');if(out)out.textContent=input.value;});});}
function hookChoices(){document.querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click',()=>{const field=b.dataset.choiceField,value=b.dataset.choice,arr=field==='emotions'?selectedEmotions:selectedNeeds;const idx=arr.indexOf(value);if(idx>=0)arr.splice(idx,1);else arr.push(value);b.classList.toggle('selected',idx<0);b.setAttribute('aria-pressed',idx<0?'true':'false');}));}
function newRecord(obj){db.records.push({id:uid(),at:new Date().toISOString(),...obj});if(save()){notify('Запись сохранена');navigate('home');}}
function attachHandlers(){hookRanges();hookChoices();
 document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));
 document.querySelectorAll('[data-practice]').forEach(b=>b.addEventListener('click',()=>navigate('practice',b.dataset.practice)));
 document.querySelectorAll('[data-finish-mindful]').forEach(b=>b.addEventListener('click',()=>navigate('practice','finish:'+b.dataset.finishMindful)));
 document.querySelectorAll('[data-finish-bite]').forEach(b=>b.addEventListener('click',()=>navigate('practice','finishbite:'+b.dataset.finishBite)));
 document.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>navigate('history','detail:'+b.dataset.detail)));
 el('dismiss-reminder')?.addEventListener('click',()=>{dismissedReminder=`${localDateKey()}:${unfilledSlot()}`;el('dismiss-reminder').closest('.reminder').remove();});
 el('add-task')?.addEventListener('click',()=>{editTask=true;render();window.scrollTo(0,0);});
 el('add-task-empty')?.addEventListener('click',()=>{editTask=true;render();window.scrollTo(0,0);});
 el('checkin-form')?.addEventListener('submit',e=>{e.preventDefault();newRecord({type:'checkin',slot:unfilledSlot(),mood:pick('mood'),energy:pick('energy'),stress:pick('stress'),body:pick('body'),emotions:selectedEmotions.slice(),note:val('checkin-note').trim(),sweetUrge:val('sweet-urge')===''?null:Number(val('sweet-urge'))});});
 el('craving-form')?.addEventListener('submit',e=>{e.preventDefault();newRecord({type:'craving',impressions:pick('lack-impressions'),time:pick('lack-time'),communication:pick('lack-communication'),urge:pick('craving-urge'),needs:selectedNeeds.slice(),note:val('craving-note').trim()});});
 el('mindful-form')?.addEventListener('submit',e=>{e.preventDefault();newRecord({type:'mindful',needs:selectedNeeds.slice(),feelings:val('feel-before').trim(),expectation:val('expectation').trim(),completedAt:null});});
 el('mindful-finish-form')?.addEventListener('submit',e=>{e.preventDefault();const r=db.records.find(x=>x.id===e.currentTarget.dataset.recordId);if(!r)return;r.pleasureShift=val('pleasure-shift');r.urgeAfter=pick('urge-after');r.afterNote=val('mindful-after-note').trim();r.completedAt=new Date().toISOString();if(save()){notify('Наблюдение дополнено');navigate('home');}});
 el('nextbite-form')?.addEventListener('submit',e=>{e.preventDefault();const r={id:uid(),at:new Date().toISOString(),type:'nextbite',urgeBefore:pick('bite-urge-before'),nextBiteWish:val('bite-next-wish').trim(),pauseStartedAt:new Date().toISOString(),completedAt:null};db.records.push(r);if(save()){notify('Начало наблюдения сохранено');navigate('practice','finishbite:'+r.id);}});
 el('stop-bite-pause')?.addEventListener('click',e=>{const r=db.records.find(x=>x.id===e.currentTarget.dataset.recordId&&x.type==='nextbite');if(!r||r.pauseEndedAt)return;r.pauseEndedAt=new Date().toISOString();save();if(biteTimerInterval){clearInterval(biteTimerInterval);biteTimerInterval=null;}el('bite-countdown').textContent='Пауза завершена раньше';e.currentTarget.remove();});
 el('nextbite-finish-form')?.addEventListener('submit',e=>{e.preventDefault();const r=db.records.find(x=>x.id===e.currentTarget.dataset.recordId&&x.type==='nextbite');if(!r)return;const end=r.pauseEndedAt||new Date().toISOString();r.pauseSeconds=Math.min(60,Math.max(0,Math.round((new Date(end)-new Date(r.pauseStartedAt))/1000)));r.urgeAfter=pick('bite-urge-after');r.afterNote=val('bite-after-note').trim();r.decision=val('bite-decision');r.completedAt=new Date().toISOString();if(save()){notify('Наблюдение сохранено');navigate('home');}});
 el('abandon-bite-practice')?.addEventListener('click',e=>{const r=db.records.find(x=>x.id===e.currentTarget.dataset.recordId&&x.type==='nextbite');if(!r)return;r.stoppedEarly=true;r.completedAt=new Date().toISOString();r.pauseSeconds=Math.min(60,Math.max(0,Math.round((new Date(r.pauseEndedAt||r.completedAt)-new Date(r.pauseStartedAt))/1000)));if(save()){notify('Упражнение прекращено');navigate('home');}});
 el('task-form')?.addEventListener('submit',e=>{e.preventDefault();const name=val('task-name').trim(),description=val('task-description').trim();const questions=val('task-questions').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,30).map(line=>/^0\s*[-–]\s*10\s*:/i.test(line)?{type:'scale',text:line.replace(/^0\s*[-–]\s*10\s*:/i,'').trim()}:{type:'text',text:line}).filter(q=>q.text);if(!name||!questions.length){notify('Укажи название и хотя бы один вопрос');return;}db.tasks.push({id:uid(),name,description,questions});if(save()){notify('Задание добавлено');navigate('practice');}});
 el('custom-task-form')?.addEventListener('submit',e=>{e.preventDefault();const task=db.tasks.find(t=>t.id===e.currentTarget.dataset.taskId);if(!task)return;const responses=task.questions.map((q,i)=>({label:q.text,type:q.type,value:val(`custom-${i}`).trim()}));newRecord({type:'custom',taskId:task.id,taskName:task.name,responses});});
 document.querySelectorAll('[data-delete-task]').forEach(b=>b.addEventListener('click',()=>{if(confirm('Удалить это задание? Ранее сохранённые ответы останутся в истории.')){db.tasks=db.tasks.filter(t=>t.id!==b.dataset.deleteTask);save();render();}}));
 document.querySelectorAll('[data-delete-record]').forEach(b=>b.addEventListener('click',()=>{if(confirm('Удалить эту запись без возможности восстановления?')){db.records=db.records.filter(r=>r.id!==b.dataset.deleteRecord);save();notify('Запись удалена');navigate('history');}}));
 el('checkins-per-day')?.addEventListener('change',()=>{const count=Number(val('checkins-per-day'));const existing=Array.from(document.querySelectorAll('#time-inputs input')).map(x=>x.value);el('time-inputs').innerHTML=normalizeTimes(existing,count).map((t,i)=>`<div class="form-field"><label class="field-label" for="time-${i}">Пауза ${i+1}</label><input type="time" id="time-${i}" value="${esc(t)}" required></div>`).join('');});
 el('settings-form')?.addEventListener('submit',e=>{e.preventDefault();const count=Number(val('checkins-per-day'));const times=Array.from(document.querySelectorAll('#time-inputs input')).map(x=>x.value);if(new Set(times).size!==times.length){notify('Выбери разные часы для каждой паузы');return;}db.settings.checkinsPerDay=count;db.settings.times=normalizeTimes(times,count);if(save()){notify('Расписание сохранено');render();}});
 el('download-calendar')?.addEventListener('click',downloadCalendar);
 el('export-data')?.addEventListener('click',exportData);
 el('import-data')?.addEventListener('click',()=>el('import-file')?.click());
 el('import-file')?.addEventListener('change',handleImport);
 el('erase-data')?.addEventListener('click',()=>{if(confirm('Удалить все записи и задания с этого устройства? Это действие необратимо без резервной копии.')){db=initial();save();notify('Локальные данные удалены');render();}});
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function exportData(){const date=localDateKey();downloadBlob(new Blob([JSON.stringify({...db,exportedAt:new Date().toISOString()},null,2)],{type:'application/json;charset=utf-8'}),`pauza-dnevnik-${date}.json`);notify('Резервная копия подготовлена');}
async function handleImport(e){const f=e.target.files?.[0];if(!f)return;try{if(f.size>10*1024*1024)throw Error('Файл больше 10 МБ');const obj=JSON.parse(await f.text());if(!Array.isArray(obj.records)||!Array.isArray(obj.tasks)||!obj.settings)throw Error('Неизвестный формат резервной копии');if(!confirm(`Импортировать ${obj.records.length} записей? Новые записи добавятся к имеющимся без дублей. Задания также будут объединены.`))return;
 const ids=new Set(db.records.map(r=>r.id));for(const r of obj.records){if(r&&typeof r.id==='string'&&typeof r.type==='string'&&typeof r.at==='string'&&!ids.has(r.id)&&!Number.isNaN(new Date(r.at).getTime())){db.records.push(r);ids.add(r.id);}}
 const tids=new Set(db.tasks.map(t=>t.id));for(const t of obj.tasks){if(t&&typeof t.id==='string'&&typeof t.name==='string'&&Array.isArray(t.questions)&&!tids.has(t.id)){db.tasks.push(t);tids.add(t.id);}}
 if(save()){notify('Резервная копия восстановлена');render();}
 }catch(err){alert('Не удалось импортировать: '+err.message);}finally{e.target.value='';}}
function icsEscape(s){return String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
function foldICS(line){const out=[];let buffer='';for(const char of line){if(new TextEncoder().encode(buffer+char).length>73){out.push(buffer);buffer=' '+char;}else buffer+=char;}out.push(buffer);return out.join('\r\n');}
function downloadCalendar(){
 const now=new Date();
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const url=/^https?:$/.test(location.protocol)?location.href.split('?')[0].split('#')[0]:'';
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Pauza//Checkins RU//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Пауза — дневник состояния'];
 readyTimes().forEach((t,i)=>{const [hh,mm]=t.split(':').map(Number);const start=new Date(now);if(hh*60+mm<=now.getHours()*60+now.getMinutes())start.setDate(start.getDate()+1);const day=`${start.getFullYear()}${pad(start.getMonth()+1)}${pad(start.getDate())}`;const dt=`${day}T${pad(hh)}${pad(mm)}00`;const endMin=hh*60+mm+5;const endDate=new Date(start);endDate.setHours(0,endMin,0,0);const endDay=`${endDate.getFullYear()}${pad(endDate.getMonth()+1)}${pad(endDate.getDate())}`;const de=`${endDay}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`;
 lines.push('BEGIN:VEVENT',`UID:pauza-${i}-${day}-${uid()}@pauza.local`,`DTSTAMP:${stamp}`,`DTSTART:${dt}`,`DTEND:${de}`,'RRULE:FREQ=DAILY;COUNT=365',`SUMMARY:${icsEscape('Пауза · как я сейчас?')}`,`DESCRIPTION:${icsEscape('Короткая отметка настроения, энергии, напряжения и самочувствия. Необязательно отвечать на каждое напоминание. '+url)}`);
 if(url)lines.push('URL:'+url);
 lines.push('BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:PT0S',`DESCRIPTION:${icsEscape('Пауза: как ты сейчас?')}`,'END:VALARM','END:VEVENT');});
 lines.push('END:VCALENDAR');
 const ics=lines.map(foldICS).join('\r\n')+'\r\n';downloadBlob(new Blob([ics],{type:'text/calendar;charset=utf-8'}),`pauza-napominaniya-${localDateKey()}.ics`);notify('Файл напоминаний подготовлен');
}
function init(){document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.tab)));render();
 if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&page==='home')render();});
 setInterval(()=>{if(!document.hidden&&page==='home')render();},120000);
}
init();