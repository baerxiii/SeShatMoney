async function getCurrentUser(){

    const {
        data:{user}
    } =
    await window.moneySB
        .auth
        .getUser();

    return user;
}
