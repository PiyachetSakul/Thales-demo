// insert page 
const firstname = document.getElementById("firstname")
const lastname = document.getElementById("lastname")
const creditcard = document.getElementById("creditcard")
const phone = document.getElementById("phone");
const form = document.getElementById("form")

function validateName() {


    if (firstname.value === "") {
        firstname.setCustomValidity("กรุณากรอกชื่อจริง");
    } else {
        firstname.setCustomValidity(""); // เคลียร์ข้อความ error
    }
};



function validateLastname() {

    if (lastname.value === "") {
        lastname.setCustomValidity("กรุณากรอกนามสกุล");
    } else {
        lastname.setCustomValidity(""); // เคลียร์ข้อความ error
    }
}



function validatePhone() {


    if (phone.value === "") {
        phone.setCustomValidity("กรุณากรอกหมายเลขโทรศัพท์");
    } else if (phone.validity.patternMismatch) {
        phone.setCustomValidity("เบอร์โทรต้องขึ้นต้นด้วย 0 และมี 10 หลัก");
    } else {
        phone.setCustomValidity(""); // เคลียร์ข้อความ error
    }
}




function validateCreditcard() {

    if (creditcard.value === "") {
        creditcard.setCustomValidity("กรุณากรอกเลขบัตรเครดิต");
    } else if (creditcard.validity.patternMismatch) {
        creditcard.setCustomValidity("เลขบัตรเครดิตต้องมี 16 หลัก");
    } else {
        creditcard.setCustomValidity(""); // เคลียร์ข้อความ error
    }
}

firstname.addEventListener("input",function (e){
     let value = e.target.value.replace(/\d/g, ""); // ลบทุกอย่างที่เป็นตัวเลข
     e.target.value = value

})

lastname.addEventListener("input",function (e){
     let value = e.target.value.replace(/\d/g, ""); // ลบทุกอย่างที่เป็นตัวเลข
     e.target.value = value
})


//ใส่ขีดในเบอร์
phone.addEventListener("input",function (e){
     let value = e.target.value.replace(/\D/g, ""); // ลบทุกอย่างที่ไม่ใช่ตัวเลข
     value = value.substring(0,10); // จำกัดแค่ 10 หลัก 
     e.target.value = value 

})

//ใส่ ขีด ใน creditcard
creditcard.addEventListener("input", function (e) {
  let value = e.target.value.replace(/\D/g, ""); // ลบทุกอย่างที่ไม่ใช่ตัวเลข
  value = value.substring(0,16); // จำกัดแค่ 16 หลัก
  // ใส่ขีดทุก 4 หลัก
  const formatted = value.match(/.{1,4}/g)?.join("-") || "";
  e.target.value = formatted;
});



//validate name
firstname.addEventListener('input', validateName);
firstname.addEventListener('invalid', validateName); // สำคัญมากสำหรับครั้งแรกตอน submit

//validate lastname
lastname.addEventListener('input', validateLastname);
lastname.addEventListener('invalid', validateLastname); // สำคัญมากสำหรับครั้งแรกตอน submit

// validate phone no.
phone.addEventListener('input', validatePhone);
phone.addEventListener('invalid', validatePhone); // สำคัญมากสำหรับครั้งแรกตอน submit

//validate creditcard no.
creditcard.addEventListener('input', validateCreditcard);
creditcard.addEventListener('invalid', validateCreditcard); // สำคัญมากสำหรับครั้งแรกตอน submit





form.addEventListener('submit', e => {
    validateName();
    validateLastname();
    validatePhone();
    validateCreditcard();
    if (!form.checkValidity()) {
        e.preventDefault();           // กัน submit ถ้ายังไม่ผ่าน
        form.reportValidity();        // ให้เบราว์เซอร์แสดงข้อความของเรา
    }
});