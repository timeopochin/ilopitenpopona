window.onload = () => {
  (function () {

    // Database stuff start
    if (!window.indexedDB) {
      console.log('Your browser doesn’t suppport IndexedDB!')
      return;
    }

    const request = indexedDB.open('subjects', 1);

    request.onupgradeneeded = (event) => {
      let db = event.target.result;
      let store = db.createObjectStore('subject', { autoIncrement: true });
      let index = store.createIndex('name', 'name', { unique: true });
    };

    request.onerror = (event) => {
      console.error(event.target.error);
    };

    request.onsuccess = (event) => {
      const db = event.target.result;

      // App logic start
      updateSubjects(db);

      document.getElementById('new-subject').onclick = (event) => {
        openSubjectModal(db);
      };
      // App logic end

    };

    function openSubjectModal(db, key=null, subject=null) {
      const modal = document.getElementById('subject-modal');
      const name = document.getElementById('name');
      const sessions = document.getElementById('sessions');
      const date = document.getElementById('date');
      if (key !== null) {
        name.value = subject.name;
        sessions.value = subject.sessions;
        const dateObj = new Date(subject.date);
        const day = ("0" + dateObj.getDate()).slice(-2);
        const month = ("0" + (dateObj.getMonth() + 1)).slice(-2);
        const dateText = dateObj.getFullYear()+"-"+(month)+"-"+(day) ;
        date.value = dateText;
      }
      const done = document.getElementById('subject-modal-done');
      const cancel = document.getElementById('subject-modal-cancel');
      modal.classList.add('is-active');
      done.onclick = (event) => {
        const newSubject = {
          name: name.value,
          sessions: sessions.value,
          date: new Date(date.value),
          lastDone: key == null ? null : subject.lastDone
        };
        insertSubject(db, newSubject, key);
        modal.classList.remove('is-active');
      };
      cancel.onclick = (event) => {
        modal.classList.remove('is-active');
      };
    }

    function insertSubject(db, subject, key) {
      const txn = db.transaction('subject', 'readwrite');
      const store = txn.objectStore('subject');

      let query = store.put(subject, key);

      query.onsuccess = (event) => {
        console.log(event);
      };

      query.onerror = (event) => {
        console.log(event.target.error);
        window.confirm('the name is already taken');
      };

      txn.oncomplete = () => {
        updateSubjects(db);
      };
    }

    function deleteSubject(db, key) {
      const txn = db.transaction('subject', 'readwrite');
      const store = txn.objectStore('subject');

      let query = store.delete(key);

      query.onsuccess = (event) => {
        console.log(event);
      };

      query.onerror = (event) => {
        console.log(event.target.error);
      };

      txn.oncomplete = () => {
        updateSubjects(db);
      };
    }

    function updateSubjects(db) {
      const txn = db.transaction('subject', 'readonly');
      const store = txn.objectStore('subject');

      let subjects = [];
      store.openCursor().onsuccess = (event) => {
        let cursor = event.target.result;
        if (cursor) {
          const sessions = cursor.value.sessions;
          let date = new Date(cursor.value.date);
          date.setHours(0, 0, 0, 0);
          let today = new Date();
          today.setHours(0, 0, 0, 0);
          const daysLeft = (date.getTime() - today.getTime())/86400000;
          // Where the magic happens
          const urgency = (daysLeft >= 7 || daysLeft < 0) ? 1 : (daysLeft - 1)/7;
          let priority;
          if (cursor.value.lastDone !== null && (new Date()).getTime() - cursor.value.lastDone.getTime() <= 86400000) {
            priority = ((daysLeft - sessions - 1)/(sessions + 1))*urgency;
          } else {
            priority = ((daysLeft - sessions)/sessions)*urgency;
          }
          const subject = {
            name: cursor.value.name,
            sessions: sessions,
            date: date,
            lastDone: cursor.value.lastDone,
            priority: priority
          };
          subjects.push([subject, cursor.key]);
          cursor.continue();
        }
      };

      txn.oncomplete = () => {

        // Sort by date
        subjects.sort((a, b) => (a[0].name > b[0].name) ? 1 : ((b[0].name > a[0].name) ? -1 : 0));

        // Update manage DOM
        const manage = document.getElementById('events-manage');
        const dateOptions = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        manage.innerHTML = '';
        for (let [subject, key] of subjects) {
          const subjectElement = document.createElement('div');
          subjectElement.classList.add('box', 'level');
          subjectElement.innerHTML = `
            <div class="level-left">
              <span class="button is-static mr-2">${subject.sessions}</span>
              <span class="is-size-4">${subject.name}</span>
            </div>
            <div class="buttons">
              <span class="button is-static">${subject.date.toLocaleDateString('en-BG', dateOptions)}</span>
              <button class="button" name="edit">edit</button>
              <button class="button is-danger" name="remove">remove</button>
            </div>
          `;
          manage.appendChild(subjectElement);
          const edit = subjectElement.querySelector('button[name="edit"]');
          edit.onclick = (event) => {
            openSubjectModal(db, key, subject);
          };
          const remove = subjectElement.querySelector('button[name="remove"]');
          remove.onclick = (event) => {
            if (window.confirm(`${subject.name} will be removed`)) {
              deleteSubject(db, key);
            }
          };
        }

        // Sort by priority
        subjects.sort((a, b) => (a[0].priority > b[0].priority) ? 1 : ((b[0].priority > a[0].priority) ? -1 : 0));
        let overdues = [];
        let musts = [];
        let shoulds = [];
        let recommends = [];
        for (let [subject, key] of subjects) {
          if (subject.sessions <= 0) {
            continue;
          }
          if (subject.priority < 0) {
            overdues.push([subject, key]);
          } else if (subject.priority == 0) {
            musts.push([subject, key]);
          } else if (subject.priority <= 1) {
            shoulds.push([subject, key]);
          } else if (subject.priority <= 5) {
            recommends.push([subject, key]);
          }
        }

        // Update today DOM
        function createList(today, subjects, extraClass, title) {
          if (subjects.length > 0) {
            const subjectsBox = document.createElement('div');
            subjectsBox.classList.add('notification', extraClass);
            today.appendChild(subjectsBox);
            const content = document.createElement('div');
            content.innerHTML = `<h4>${title}</h4>`;
            content.classList.add('content');
            subjectsBox.appendChild(content);
            const list = document.createElement('ul');
            content.appendChild(list);
            for (let [subject, key] of subjects) {
              const item = document.createElement('li');
              item.classList.add('level', 'is-mobile', 'my-0');
              let toggle = '<a name="toggle">mark as done</a>';
              let check = '';
              if (subject.lastDone !== null && (new Date()).getTime() - subject.lastDone.getTime() <= 86400000) {
                toggle = '<a class="mr-3" name="extra">i’ve done extra</a><a name="toggle">mark as undone</a>';
                check = ' ✔';
              }
              item.innerHTML = `<span>${subject.name + check}</span><div class="level-right">${toggle}</div>`;
              list.appendChild(item);
              item.querySelector('a[name="toggle"]').onclick = (event) => {
                if (toggle === '<a name="toggle">mark as done</a>') {
                  subject.lastDone = new Date();
                  subject.sessions--;
                } else {
                  subject.lastDone = null;
                  subject.sessions++;
                }
                insertSubject(db, subject, key);
              };
              if (toggle !== '<a name="toggle">mark as done</a>') {
                item.querySelector('a[name="extra"]').onclick = (event) => {
                  if (window.confirm(`${subject.name} sessions left will be reduced by 1`)) {
                    subject.sessions--;
                    insertSubject(db, subject, key);
                  }
                };
              }
            }
          }
        }

        const today = document.getElementById('events-today');
        today.innerHTML = '';
        createList(today, overdues, 'is-danger', 'overdue');
        createList(today, musts, 'is-warning', 'must do');
        createList(today, shoulds, 'is-success', 'should do');
        createList(today, recommends, 'is-info', 'recommended');
      };
    }
    // Database stuff end
  })()
};
